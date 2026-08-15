// Génère un BROUILLON de lettre de motivation pour UNE offre, à partir du profil.
// Haiku = coût minime. Le brouillon est fait pour être retravaillé par le candidat.

import {
  readBody, callClaude, sendError, requireKey,
  normLang, langInstruction, MODEL_FAST,
} from "./_claude.js";

const MAX_TOKENS = 900;

function systemPrompt(lang) {
  return (
    "Tu rédiges un BROUILLON de lettre de motivation. " +
    "Contraintes : 180 à 220 mots, ton professionnel mais naturel, pas de formules pompeuses " +
    "ni de flatterie creuse. Structure : accroche liée au poste, 1 paragraphe reliant le parcours " +
    "du candidat aux besoins de l'offre (appuie-toi sur des éléments CONCRETS du profil), " +
    "1 paragraphe court de motivation, formule de politesse sobre. " +
    "Laisse [Prénom Nom] en signature et [Nom de l'entreprise] si le nom n'est pas fourni. " +
    "N'invente AUCUNE expérience absente du profil. Réponds uniquement avec le texte de la lettre." +
    langInstruction(lang)
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée" }); return; }
  const apiKey = requireKey(res);
  if (!apiKey) return;

  let body;
  try { body = await readBody(req); }
  catch (e) { res.status(400).json({ error: "Corps de requête invalide." }); return; }

  const { profile, offer } = body;
  const lang = normLang(body.lang);
  if (!profile || !offer || !offer.title) {
    res.status(400).json({ error: "Profil ou offre manquant." });
    return;
  }

  const profileText =
    `Profil : ${profile.headline || ""}\n` +
    `Résumé du parcours : ${profile.summary || ""}\n` +
    `Compétences : ${(profile.skills || []).join(", ")}`;

  const offerText =
    `Poste : ${offer.title}\n` +
    (offer.company ? `Entreprise : ${offer.company}\n` : "") +
    (offer.contract ? `Contrat : ${offer.contract}\n` : "") +
    (offer.description ? `Description : ${offer.description}\n` : "");

  let letter;
  try {
    letter = await callClaude(apiKey, {
      model: MODEL_FAST,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(lang),
      messages: [{ role: "user", content: profileText + "\n\n---\n\n" + offerText }],
    });
  } catch (e) { sendError(res, e); return; }

  if (!letter) {
    res.status(200).json({ letter: "", warning: "La rédaction n'a rien renvoyé cette fois-ci — réessaie." });
    return;
  }
  res.status(200).json({ letter });
}
