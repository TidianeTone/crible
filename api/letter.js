// Génère un BROUILLON de lettre de motivation pour UNE offre, à partir du profil.
// Haiku = coût minime. Le brouillon est fait pour être retravaillé par le candidat.

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  version: "2023-06-01",
  model: "claude-haiku-4-5-20251001",
  maxTokens: 900,
};

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const SYSTEM_PROMPT =
  "Tu rédiges un BROUILLON de lettre de motivation en français. " +
  "Contraintes : 180 à 220 mots, ton professionnel mais naturel, pas de formules pompeuses " +
  "ni de flatterie creuse. Structure : accroche liée au poste, 1 paragraphe reliant le parcours " +
  "du candidat aux besoins de l'offre (appuie-toi sur des éléments CONCRETS du profil), " +
  "1 paragraphe court de motivation, formule de politesse sobre. " +
  "Laisse [Prénom Nom] en signature et [Nom de l'entreprise] si le nom n'est pas fourni. " +
  "N'invente AUCUNE expérience absente du profil. Réponds uniquement avec le texte de la lettre.";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée" }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Clé ANTHROPIC_API_KEY manquante côté serveur." }); return; }

  let body;
  try { body = await readBody(req); }
  catch (e) { res.status(400).json({ error: "Corps de requête invalide." }); return; }

  const { profile, offer } = body;
  if (!profile || !offer || !offer.title) {
    res.status(400).json({ error: "Profil ou offre manquant." });
    return;
  }

  const profileText =
    `Profil : ${profile.headline || ""}\n` +
    `Résumé du parcours : ${profile.summary || profile.experience || ""}\n` +
    `Compétences : ${(profile.skills || []).join(", ")}`;

  const offerText =
    `Poste : ${offer.title}\n` +
    (offer.company ? `Entreprise : ${offer.company}\n` : "") +
    (offer.contract ? `Contrat : ${offer.contract}\n` : "") +
    (offer.description ? `Description : ${offer.description}\n` : "");

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
        messages: [{ role: "user", content: profileText + "\n\n---\n\n" + offerText }],
      }),
    });
  } catch (e) { res.status(502).json({ error: "Appel API Claude impossible : " + e.message }); return; }

  if (!apiRes.ok) {
    const txt = await apiRes.text();
    res.status(502).json({ error: `API Claude HTTP ${apiRes.status}`, detail: txt.slice(0, 300) });
    return;
  }

  const data = await apiRes.json();
  const letter = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!letter) {
    res.status(200).json({
      letter: "",
      warning: "La rédaction n'a rien renvoyé cette fois-ci — réessaie.",
    });
    return;
  }
  res.status(200).json({ letter });
}
