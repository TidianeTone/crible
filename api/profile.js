// Analyse le CV UNE SEULE FOIS -> profil riche, éditable côté client.
// v5 : on extrait aussi les expériences détaillées (experiences[]), car la
// réécriture de CV (/api/tailor) a besoin du contenu réel des postes, pas
// seulement du résumé de 100 mots. Le PDF, lui, n'est jamais conservé.

import {
  readBody, callClaude, parseJsonLoose, sendError, requireKey,
  normLang, langInstruction, MODEL_FAST,
} from "./_claude.js";

// La lecture d'un PDF de plusieurs pages dépasse souvent les 10 s par défaut.
export const config = { maxDuration: 60 };

const MAX_TOKENS = 3000;

function systemPrompt(lang) {
  return (
    "Tu analyses le CV d'un candidat (document PDF), quelle que soit sa langue. " +
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown. " +
    "Format exact : " +
    '{"headline":"...","summary":"...","skills":["..."],"keywords":["..."],' +
    '"experiences":[{"role":"...","company":"...","period":"...","bullets":["..."]}]}' +
    " où : headline = le profil en une phrase courte ; " +
    "summary = résumé du parcours en ENVIRON 100 MOTS, précis et granulaire : " +
    "expériences marquantes avec durées, secteurs, responsabilités concrètes, formations, " +
    "particularités du parcours (reconversions, trous, projets perso notables), " +
    "à la troisième personne, factuel, sans flatterie ; " +
    "skills = 5 à 10 compétences clés ; " +
    "keywords = 1 à 3 intitulés de poste à chercher pour ce profil, " +
    (normLang(lang) === "en"
      ? "in ENGLISH ; "
      : "en FRANÇAIS même si le CV est en anglais (ex: un CV 'Product Manager' anglophone -> [\"product manager\", \"chef de produit\"]) ; ") +
    "experiences = les postes du CV, du plus récent au plus ancien, 6 maximum, " +
    "chacun avec role (intitulé), company (employeur), period (ex: \"2021 – 2024\") " +
    "et bullets = 2 à 5 phrases reprenant FIDÈLEMENT les missions et résultats " +
    "tels qu'ils figurent dans le CV. " +
    "N'INVENTE RIEN : si une information est absente du CV, mets une chaîne vide. " +
    "Si le CV ne contient aucune expérience professionnelle, renvoie experiences: []." +
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
  if (!body.cvBase64) { res.status(400).json({ error: "CV manquant." }); return; }

  const lang = normLang(body.lang);

  let text;
  try {
    text = await callClaude(apiKey, {
      model: MODEL_FAST,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(lang),
      messages: [{
        role: "user",
        content: [
          { type: "document",
            source: { type: "base64", media_type: body.cvType || "application/pdf", data: body.cvBase64 } },
          { type: "text", text: "Analyse ce CV." },
        ],
      }],
    });
  } catch (e) { sendError(res, e); return; }

  const parsed = parseJsonLoose(text, "object");
  if (!parsed) {
    // Retour 200 avec un profil minimal éditable plutôt qu'une erreur bloquante :
    // l'utilisateur peut corriger à la main dans le panneau profil.
    res.status(200).json({
      profile: { headline: "", summary: (text || "").slice(0, 600), skills: [], keywords: [], experiences: [] },
      warning: "L'IA n'a pas renvoyé un format exploitable ; résumé brut à corriger à la main.",
    });
    return;
  }

  // Champs manquants -> valeurs sûres (jamais de null qui casse le front).
  const experiences = Array.isArray(parsed.experiences)
    ? parsed.experiences.slice(0, 6).map((x) => ({
        role: String(x && x.role || ""),
        company: String(x && x.company || ""),
        period: String(x && x.period || ""),
        bullets: Array.isArray(x && x.bullets) ? x.bullets.map(String).filter(Boolean).slice(0, 6) : [],
      }))
    : [];

  res.status(200).json({
    profile: {
      headline: parsed.headline || "",
      summary: parsed.summary || "",
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      experiences,
    },
    model: MODEL_FAST,
  });
}
