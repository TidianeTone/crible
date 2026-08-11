// Analyse le CV UNE SEULE FOIS -> profil riche (~100 mots), éditable côté client.

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  version: "2023-06-01",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 1500,
};

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const SYSTEM_PROMPT =
  "Tu analyses le CV d'un candidat (document PDF), quelle que soit sa langue (français, anglais, autre). " +
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown. " +
  "Format exact : " +
  '{"headline":"...","summary":"...","skills":["..."],"keywords":["..."]}' +
  " où : headline = le profil en une phrase courte ; " +
  "summary = résumé du parcours en ENVIRON 100 MOTS, précis et granulaire : " +
  "expériences marquantes avec durées, secteurs, responsabilités concrètes, formations, " +
  "particularités du parcours (reconversions, trous, projets perso notables). " +
  "Écris ce résumé à la troisième personne, factuel, sans flatterie ; " +
  "skills = 5 à 10 compétences clés ; " +
  "keywords = 1 à 3 intitulés de poste à chercher pour ce profil, en FRANÇAIS même si le CV est en anglais " +
  "(ex: un CV 'Product Manager' anglophone -> keywords [\"product manager\", \"chef de produit\"]). " +
  "Le résumé et les compétences restent en français.";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée" }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Clé ANTHROPIC_API_KEY manquante côté serveur." }); return; }

  let body;
  try { body = await readBody(req); }
  catch (e) { res.status(400).json({ error: "Corps de requête invalide." }); return; }
  if (!body.cvBase64) { res.status(400).json({ error: "CV manquant." }); return; }

  let apiRes;
  try {
    apiRes = await fetch(ANTHROPIC.url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC.version,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC.model,
        max_tokens: ANTHROPIC.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "document",
              source: { type: "base64", media_type: body.cvType || "application/pdf", data: body.cvBase64 } },
            { type: "text", text: "Analyse ce CV." },
          ],
        }],
      }),
    });
  } catch (e) { res.status(502).json({ error: "Appel API Claude impossible : " + e.message }); return; }

  if (!apiRes.ok) {
    const txt = await apiRes.text();
    res.status(502).json({ error: `API Claude HTTP ${apiRes.status}`, detail: txt.slice(0, 300) });
    return;
  }

  const data = await apiRes.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  // Robustesse : si du texte entoure le JSON, extraire le premier objet {...}
  if (!cleaned.startsWith("{")) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) cleaned = m[0];
  }

  let profile;
  try { profile = JSON.parse(cleaned); }
  catch (e) {
    // Retour 200 avec profil minimal éditable plutôt qu'une erreur bloquante :
    // l'utilisateur peut corriger à la main dans le panneau profil.
    res.status(200).json({
      profile: { headline: "", summary: cleaned.slice(0, 600), skills: [], keywords: [] },
      warning: "L'IA n'a pas renvoyé un format exploitable ; résumé brut à corriger à la main.",
    });
    return;
  }
  // Champs manquants -> valeurs sûres (jamais de null qui casse le front)
  profile = {
    headline: profile.headline || "",
    summary: profile.summary || "",
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    keywords: Array.isArray(profile.keywords) ? profile.keywords : [],
  };

  res.status(200).json({ profile, model: ANTHROPIC.model });
}
