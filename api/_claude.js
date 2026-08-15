// Helpers partagés par les fonctions serverless.
// Le préfixe "_" empêche Vercel d'exposer ce fichier comme une route.
// La clé ANTHROPIC_API_KEY reste côté serveur : elle n'apparaît jamais dans le code
// ni dans les réponses envoyées au navigateur.

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

// Haiku : tri, extraction, analyse. Sonnet : la réécriture du CV, là où la
// qualité rédactionnelle se voit vraiment.
export const MODEL_FAST = "claude-haiku-4-5-20251001";
export const MODEL_WRITER = "claude-sonnet-5";

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

// Consigne de langue ajoutée à la fin de chaque system prompt.
export function langInstruction(lang) {
  return normLang(lang) === "en"
    ? " Write every piece of text you produce in ENGLISH, whatever the language of the CV or the job ad."
    : " Rédige tous les textes que tu produis en FRANÇAIS, quelle que soit la langue du CV ou de l'offre.";
}

/**
 * Appelle l'API Claude et renvoie le texte concaténé des blocs de réponse.
 * Lève une Error avec un `status` HTTP exploitable par l'appelant.
 */
export async function callClaude(apiKey, payload) {
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

export function requireKey(res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé ANTHROPIC_API_KEY manquante côté serveur." });
    return null;
  }
  return apiKey;
}
