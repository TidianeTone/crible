// Adaptation du CV à UNE offre, en 3 étapes enchaînées côté client.
// Chaque appel traite une seule étape et renvoie du JSON : le front affiche
// la progression au lieu d'attendre 30 s devant un écran figé.
//
//   step 1 — regard d'un recruteur senior de l'entreprise : mots-clés manquants
//            et signaux d'alerte repérables en moins de 10 secondes.      (Haiku)
//   step 2 — réécriture des expériences en formule XYZ de Google, en
//            intégrant les mots-clés et en supprimant les signaux d'alerte. (Sonnet)
//   step 3 — passage au crible d'un filtre ATS + d'un recruteur qui lit
//            200 CV d'affilée : ce qui serait ignoré, et comment le réécrire. (Haiku)

import {
  readBody, callClaude, parseJsonLoose, sendError, requireKey,
  normLang, langInstruction, MODEL_FAST, MODEL_WRITER,
} from "./_claude.js";

// La réécriture par Sonnet dépasse largement les 10 s par défaut de Vercel.
export const config = { maxDuration: 60 };

const NO_INVENT =
  " RÈGLE ABSOLUE : n'invente aucune expérience, aucun employeur, aucun chiffre. " +
  "Tu peux reformuler, hiérarchiser et rendre explicite ce qui est implicite, " +
  "jamais ajouter un fait absent du CV. Si un résultat chiffré manque, écris " +
  "un marqueur [à chiffrer] plutôt qu'un nombre inventé. " +
  // La frontière utile n'est pas « générique vs précis » mais « vérifiable en
  // entretien vs pas ». Décrire une mission inhérente au métier ne trahit rien ;
  // nommer un outil que le CV ne cite pas se retourne contre le candidat dès la
  // première question technique.
  "DISTINCTION IMPORTANTE : tu PEUX décrire une mission inhérente au métier même " +
  "si le CV ne la détaille pas (un réceptionniste gère des réservations, c'est " +
  "constitutif du poste). Tu ne PEUX PAS nommer un outil, un logiciel, un système, " +
  "une certification, un employeur ou une formation qui ne figure pas dans le CV : " +
  "écris la fonction (« le logiciel de réservation de l'hôtel »), jamais un produit " +
  "précis (« Opera », « le PMS ») que le candidat n'a pas revendiqué. " +
  "Tu ne PEUX PAS non plus élargir une disponibilité ou une période que le CV borne " +
  "(un parcours de nuit ne devient pas « jour et nuit »).";

function offerText(offer) {
  return (
    `Poste : ${offer.title || ""}\n` +
    (offer.company ? `Entreprise : ${offer.company}\n` : "") +
    (offer.contract ? `Contrat : ${offer.contract}\n` : "") +
    (offer.description ? `Description de l'offre : ${offer.description}\n` : "")
  );
}

function experiencesText(experiences) {
  if (!Array.isArray(experiences) || experiences.length === 0) return "(aucune expérience détaillée)";
  return experiences
    .map((x, i) => {
      const head = [x.role, x.company, x.period].filter(Boolean).join(" · ");
      const lines = (x.bullets || []).map((b) => "  - " + b).join("\n");
      return `${i + 1}. ${head}\n${lines}`;
    })
    .join("\n\n");
}

function profileText(profile) {
  return (
    `Profil : ${profile.headline || ""}\n` +
    `Résumé du parcours : ${profile.summary || ""}\n` +
    `Compétences déclarées : ${(profile.skills || []).join(", ")}\n\n` +
    `EXPÉRIENCES ACTUELLES DU CV :\n${experiencesText(profile.experiences)}`
  );
}

// ---- Étape 1 : le recruteur senior ----
function step1(profile, offer, lang) {
  const company = offer.company || (normLang(lang) === "en" ? "the hiring company" : "l'entreprise qui recrute");
  return {
    model: MODEL_FAST,
    max_tokens: 1600,
    system:
      `Tu joues le rôle d'un recruteur senior chez ${company}, qui connaît le poste par cœur. ` +
      "On te donne le CV d'un candidat et l'offre d'emploi. " +
      "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown. " +
      'Format exact : {"missingKeywords":[{"keyword":"...","why":"..."}],' +
      '"redFlags":[{"flag":"...","fix":"..."}]} ' +
      "où missingKeywords = EXACTEMENT les 5 mots-clés ou compétences les plus importants " +
      "présents dans l'offre et absents (ou trop implicites) dans le CV, chacun avec why = " +
      "pourquoi ce mot-clé compte pour CE poste (20 mots max) ; " +
      "redFlags = EXACTEMENT les 3 signaux d'alerte qu'un recruteur repérerait sur ce CV " +
      "en moins de 10 secondes face à cette offre (trou, incohérence, formulation vague, " +
      "expérience trop éloignée, absence de résultats chiffrés...), chacun avec fix = " +
      "comment le corriger concrètement (20 mots max). " +
      "Sois direct et utile, pas complaisant." +
      langInstruction(lang),
    messages: [{ role: "user", content: profileText(profile) + "\n\n---\n\n" + offerText(offer) }],
  };
}

// ---- Étape 2 : la réécriture XYZ (le modèle le plus soigné) ----
function step2(profile, offer, audit, lang) {
  return {
    model: MODEL_WRITER,
    max_tokens: 8000,
    output_config: { effort: "medium" },
    system:
      "Tu réécris la section EXPÉRIENCES d'un CV pour la rendre imbattable sur une offre précise. " +
      "Applique la formule XYZ de Google à CHAQUE puce : « Accompli X, mesuré par Y, en faisant Z » : " +
      "un résultat, une mesure, un moyen ; commence par un verbe d'action, jamais par « Responsable de ». " +
      "Intègre NATURELLEMENT les mots-clés manquants fournis (pas de bourrage : un mot-clé placé " +
      "dans une phrase qui a du sens) et fais disparaître chacun des signaux d'alerte fournis. " +
      "Conserve l'ordre chronologique et TOUS les postes du CV d'origine. " +
      "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown. " +
      'Format exact : {"experiences":[{"role":"...","company":"...","period":"...",' +
      '"bullets":["..."]}],"changes":["..."]} ' +
      "où bullets = 2 à 4 puces réécrites par poste, et changes = 3 à 5 phrases expliquant " +
      "ce que tu as changé et pourquoi." +
      NO_INVENT +
      langInstruction(lang),
    messages: [{
      role: "user",
      content:
        profileText(profile) + "\n\n---\n\n" + offerText(offer) +
        "\n\n---\n\nDIAGNOSTIC DU RECRUTEUR À CORRIGER :\n" +
        "Mots-clés manquants : " +
        (audit.missingKeywords || []).map((k) => `${k.keyword} (${k.why})`).join(" ; ") +
        "\nSignaux d'alerte : " +
        (audit.redFlags || []).map((f) => `${f.flag} → ${f.fix}`).join(" ; "),
    }],
  };
}

// ---- Étape 3 : le filtre ATS et le recruteur qui lit 200 CV ----
function step3(experiences, offer, lang) {
  return {
    model: MODEL_FAST,
    max_tokens: 2500,
    system:
      "Tu joues DEUX rôles à la fois : un filtre ATS (analyse automatique de CV par mots-clés " +
      "et structure) et un recruteur humain qui lit 200 CV d'affilée et survole chacun 8 secondes. " +
      "On te donne la nouvelle section expériences d'un CV et l'offre visée. " +
      "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown. " +
      'Format exact : {"atsScore":75,"verdict":"...","ignored":[{"section":"...","why":"..."}],' +
      '"rewrites":[{"section":"...","before":"...","after":"..."}]} ' +
      "où atsScore = entier 0-100 estimant les chances de passer le filtre ATS pour CETTE offre ; " +
      "verdict = une phrase, l'impression laissée après 8 secondes de lecture ; " +
      "ignored = 2 à 4 passages qui seraient survolés ou ignorés, avec why = pourquoi ; " +
      "rewrites = 2 à 4 réécritures, before = le passage faible tel quel, " +
      "after = la version qui accroche vraiment l'attention." +
      NO_INVENT +
      // Placé en dernier, et formulé comme une vérification à faire plutôt
      // qu'un principe : noyé au milieu du prompt, le modèle continuait de
      // prêter au candidat les horaires demandés par l'offre plutôt que ceux
      // que son CV montre. Le verdict est lu comme un miroir du CV — s'il
      // flatte, le candidat arrive en entretien sûr d'un atout inexistant.
      " AVANT DE RÉPONDRE, RELIS TON VERDICT : chaque fait qu'il attribue au " +
      "candidat doit être présent noir sur blanc dans les expériences fournies. " +
      "Un parcours qui ne montre que des nuits se décrit « en nuit », jamais " +
      "« nuit et jour », même si l'offre demande les deux. Ce que le candidat " +
      "n'a pas, dis-le comme un manque, pas comme un acquis." +
      langInstruction(lang),
    messages: [{
      role: "user",
      content: "NOUVEAU CV, EXPÉRIENCES :\n" + experiencesText(experiences) + "\n\n---\n\n" + offerText(offer),
    }],
  };
}

function normExperiences(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((x) => ({
    role: String(x && x.role || ""),
    company: String(x && x.company || ""),
    period: String(x && x.period || ""),
    bullets: Array.isArray(x && x.bullets) ? x.bullets.map(String).filter(Boolean).slice(0, 6) : [],
  }));
}

function normPairs(list, a, b, max) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map((x) => ({
    [a]: String(x && x[a] || ""),
    [b]: String(x && x[b] || ""),
  }));
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
  const step = Number(body.step);

  if (!profile || !offer || !offer.title) { res.status(400).json({ error: "Profil ou offre manquant." }); return; }
  if (![1, 2, 3].includes(step)) { res.status(400).json({ error: "Étape inconnue." }); return; }

  if (step >= 2 && (!Array.isArray(profile.experiences) || profile.experiences.length === 0)) {
    res.status(400).json({
      error: "Aucune expérience détaillée dans le profil. Recharge ton CV pour permettre la réécriture.",
    });
    return;
  }

  let payload;
  if (step === 1) {
    payload = step1(profile, offer, lang);
  } else if (step === 2) {
    if (!body.audit) { res.status(400).json({ error: "Diagnostic de l'étape 1 manquant." }); return; }
    payload = step2(profile, offer, body.audit, lang);
  } else {
    if (!Array.isArray(body.experiences) || body.experiences.length === 0) {
      res.status(400).json({ error: "CV réécrit de l'étape 2 manquant." });
      return;
    }
    payload = step3(body.experiences, offer, lang);
  }

  let text;
  try { text = await callClaude(apiKey, payload); }
  catch (e) { sendError(res, e); return; }

  const parsed = parseJsonLoose(text, "object");
  if (!parsed) {
    res.status(502).json({ error: "Réponse illisible à l'étape " + step + ", réessaie." });
    return;
  }

  if (step === 1) {
    res.status(200).json({
      step: 1,
      missingKeywords: normPairs(parsed.missingKeywords, "keyword", "why", 5),
      redFlags: normPairs(parsed.redFlags, "flag", "fix", 3),
    });
    return;
  }

  if (step === 2) {
    const experiences = normExperiences(parsed.experiences);
    if (experiences.length === 0) {
      res.status(502).json({ error: "La réécriture n'a rien renvoyé, réessaie." });
      return;
    }
    res.status(200).json({
      step: 2,
      experiences,
      changes: Array.isArray(parsed.changes) ? parsed.changes.map(String).slice(0, 6) : [],
      model: MODEL_WRITER,
    });
    return;
  }

  const score = Number(parsed.atsScore);
  res.status(200).json({
    step: 3,
    atsScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    verdict: String(parsed.verdict || ""),
    ignored: normPairs(parsed.ignored, "section", "why", 4),
    rewrites: Array.isArray(parsed.rewrites)
      ? parsed.rewrites.slice(0, 4).map((x) => ({
          section: String(x && x.section || ""),
          before: String(x && x.before || ""),
          after: String(x && x.after || ""),
        }))
      : [],
  });
}
