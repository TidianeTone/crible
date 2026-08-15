// Note la correspondance de chaque offre avec le profil du candidat.
// Reçoit le profil résumé (pas le CV) : le PDF ne quitte jamais le navigateur
// après la première analyse.

import {
  readBody, callClaude, parseJsonLoose, sendError, requireKey,
  normLang, langInstruction, MODEL_FAST,
} from "./_claude.js";

const MAX_TOKENS = 4000;

function buildOffersText(offers) {
  return offers
    .map((o, i) => {
      const meta = [o.company, o.contract].filter(Boolean).join(" — ");
      const desc = (o.description || "").slice(0, 180);
      return `${i}. ${o.title}${meta ? " (" + meta + ")" : ""}${desc ? " : " + desc : ""}`;
    })
    .join("\n");
}

function systemPrompt(lang) {
  return (
    "Tu es un assistant de recrutement. On te fournit le PROFIL RÉSUMÉ d'un candidat " +
    "et une liste numérotée d'offres d'emploi. Pour chaque offre, évalue à quel point elle " +
    "correspond au profil, à l'expérience et aux compétences du candidat. " +
    "Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balises Markdown. " +
    'Format exact : [{"i":0,"score":85,"reason":"..."}]. ' +
    '"i" = index de l\'offre, "score" = entier de 0 à 100, ' +
    '"reason" = justification courte (12 mots maximum). ' +
    "Inclure TOUTES les offres de la liste." +
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

  const offers = Array.isArray(body.offers) ? body.offers.slice(0, 60) : [];
  const profile = body.profile;
  const lang = normLang(body.lang);

  if (!profile) { res.status(400).json({ error: "Profil manquant (analyse d'abord le CV)." }); return; }
  if (offers.length === 0) { res.status(400).json({ error: "Aucune offre à évaluer." }); return; }

  const profileText =
    `Profil : ${profile.headline || ""}\n` +
    `Compétences : ${(profile.skills || []).join(", ")}\n` +
    `Parcours : ${profile.summary || ""}`;

  let text;
  try {
    text = await callClaude(apiKey, {
      model: MODEL_FAST,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(lang),
      messages: [{
        role: "user",
        content: profileText + "\n\nVoici les offres d'emploi à évaluer :\n\n" + buildOffersText(offers),
      }],
    });
  } catch (e) { sendError(res, e); return; }

  const scores = parseJsonLoose(text, "array");
  if (!Array.isArray(scores)) {
    // Classement illisible -> 200 avec scores vides : le front garde l'ordre initial.
    res.status(200).json({ scores: [], warning: "Classement indisponible cette fois-ci." });
    return;
  }

  res.status(200).json({ scores });
}
