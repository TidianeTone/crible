// Helpers partagés par les fonctions serverless.
// Le préfixe "_" empêche Vercel d'exposer ce fichier comme une route.
// Les clés API restent côté serveur : elles n'apparaissent jamais dans le code
// ni dans les réponses envoyées au navigateur.

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// ---------------------------------------------------------------------------
// Claude par défaut : Haiku pour le tri et l'analyse, Sonnet pour la
// réécriture. Essai DeepSeek mené le 25/08/2026, non retenu — meilleure
// lecture de l'offre, mais 145 s par adaptation contre 37 s, au-dessus du
// plafond de 60 s de la fonction Vercel.
// Le rebrancher : IA_PROVIDER=deepseek dans les variables Vercel.
// ---------------------------------------------------------------------------
const PROVIDER = (process.env.IA_PROVIDER || "anthropic").trim().toLowerCase() === "deepseek"
  ? "deepseek" : "anthropic";

// Haiku/Flash : tri, extraction, analyse. Sonnet/Pro : la réécriture du CV, là
// où la qualité rédactionnelle se voit vraiment.
export const MODEL_FAST = PROVIDER === "deepseek" ? "deepseek-v4-flash" : "claude-haiku-4-5-20251001";
export const MODEL_WRITER = PROVIDER === "deepseek" ? "deepseek-v4-pro" : "claude-sonnet-5";

export async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// "fr" par défaut : toute valeur inconnue retombe sur le français.
export function normLang(lang) {
  return lang === "en" ? "en" : "fr";
}

// Le tiret cadratin est la signature d'un texte écrit par un modèle : personne
// ne le tape sur un clavier. Une lettre de motivation qui en est constellée se
// fait repérer, et c'est précisément ce que le candidat ne veut pas. La consigne
// vit ici parce que toutes les routes ajoutent langInstruction à leur prompt.
const SANS_CADRATIN =
  " N'utilise JAMAIS de tiret cadratin (—) ni de tiret demi-cadratin (–) dans" +
  " ce que tu écris. Emploie la ponctuation ordinaire : virgule, deux-points," +
  " point, parenthèses.";

const NO_EM_DASH =
  " NEVER use an em dash (—) or en dash (–) in what you write. Use ordinary" +
  " punctuation instead: comma, colon, full stop, parentheses.";

// Consigne de langue ajoutée à la fin de chaque system prompt.
export function langInstruction(lang) {
  return normLang(lang) === "en"
    ? " Write every piece of text you produce in ENGLISH, whatever the language of the CV or the job ad." + NO_EM_DASH
    : " Rédige tous les textes que tu produis en FRANÇAIS, quelle que soit la langue du CV ou de l'offre." + SANS_CADRATIN;
}

async function callAnthropic(apiKey, payload) {
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const err = new Error("Appel API Claude impossible : " + e.message);
    err.status = 502;
    throw err;
  }

  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`API Claude HTTP ${res.status}`);
    err.status = 502;
    err.detail = txt.slice(0, 300);
    throw err;
  }

  const data = await res.json();

  // Un refus de sécurité renvoie un 200 avec un contenu vide : à traiter
  // comme un cas normal, pas comme une panne.
  if (data.stop_reason === "refusal") {
    const err = new Error("La demande a été refusée par le modèle.");
    err.status = 422;
    throw err;
  }

  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// DeepSeek sert une API compatible OpenAI : le system prompt rejoint les
// messages, et le contenu doit être du texte (pas de bloc "document" Anthropic
// pour un PDF — cette route reste forcée sur Anthropic, voir forceAnthropic).
async function callDeepSeek(apiKey, payload) {
  const messages = [];
  if (payload.system) messages.push({ role: "system", content: payload.system });
  messages.push(...payload.messages);

  // V4 est un modèle à raisonnement : les tokens de réflexion — invisibles
  // dans la réponse — sont décomptés du même max_tokens que le texte utile.
  // Les budgets des routes sont calibrés pour Claude, qui n'a pas cette
  // surcharge ; les reprendre tels quels tronque la réponse en plein JSON et
  // la rend illisible. Mesuré : ~600 tokens de réflexion sur une demande
  // triviale, bien plus sur les prompts d'analyse.
  const maxTokens = (payload.max_tokens || 1000) * 2 + 2000;

  let res;
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: payload.model, max_tokens: maxTokens, messages }),
    });
  } catch (e) {
    const err = new Error("Appel API DeepSeek impossible : " + e.message);
    err.status = 502;
    throw err;
  }

  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`API DeepSeek HTTP ${res.status}`);
    err.status = 502;
    err.detail = txt.slice(0, 300);
    throw err;
  }

  const data = await res.json();
  const choix = data.choices?.[0] || {};
  // Tronqué malgré la marge : le dire, plutôt que de laisser l'appelant
  // échouer sur un JSON coupé au milieu avec un message d'erreur trompeur.
  if (choix.finish_reason === "length") {
    const err = new Error("Réponse DeepSeek tronquée (budget de tokens atteint).");
    err.status = 502;
    throw err;
  }
  return (choix.message?.content || "").trim();
}

/**
 * Appelle le modèle IA (Claude ou DeepSeek selon IA_PROVIDER) et renvoie le
 * texte de la réponse. Lève une Error avec un `status` HTTP exploitable par
 * l'appelant. `forceAnthropic` : pour les routes qui envoient un bloc PDF
 * (profile.js), que DeepSeek ne sait pas lire dans ce format.
 */
export async function callClaude(apiKey, payload, { forceAnthropic = false } = {}) {
  return (forceAnthropic || PROVIDER === "anthropic")
    ? callAnthropic(apiKey, payload)
    : callDeepSeek(apiKey, payload);
}

/**
 * Extrait un objet ou un tableau JSON d'une réponse texte, même si le modèle
 * l'a entouré de prose ou de balises Markdown. Renvoie null si rien n'est
 * exploitable — l'appelant décide alors quoi afficher.
 */
export function parseJsonLoose(text, expect = "object") {
  if (!text) return null;
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const open = expect === "array" ? "[" : "{";
  if (!cleaned.startsWith(open)) {
    const m = cleaned.match(expect === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
    if (!m) return null;
    cleaned = m[0];
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

// Réponse d'erreur homogène pour toutes les routes.
export function sendError(res, e) {
  const status = e.status || 500;
  const payload = { error: e.message || "Erreur interne." };
  if (e.detail) payload.detail = e.detail;
  res.status(status).json(payload);
}

export function requireKey(res, { forceAnthropic = false } = {}) {
  const provider = forceAnthropic ? "anthropic" : PROVIDER;
  const envVar = provider === "deepseek" ? "DEEPSEEK_API_KEY" : "ANTHROPIC_API_KEY";
  const apiKey = process.env[envVar];
  if (!apiKey) {
    res.status(500).json({ error: `Clé ${envVar} manquante côté serveur.` });
    return null;
  }
  return apiKey;
}
