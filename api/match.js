// Fonction serverless (Vercel). Reçoit le CV (PDF en base64) + la liste des offres,
// demande à Claude de noter la correspondance de chaque offre avec le profil.
// La clé API Claude reste côté serveur (variable ANTHROPIC_API_KEY).

const ANTHROPIC = {
  url: "https://api.anthropic.com/v1/messages",
  version: "2023-06-01",
  model: "claude-haiku-4-5-20251001", // rapide + économique, adapté au tri
  maxTokens: 4000,
};

async function readBody(req) {
  if (req.body) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildOffersText(offers) {
  return offers
    .map((o, i) => {
      const meta = [o.company, o.contract].filter(Boolean).join(" — ");
      const desc = (o.description || "").slice(0, 180);
      return `${i}. ${o.title}${meta ? " (" + meta + ")" : ""}${
        desc ? " : " + desc : ""
      }`;
    })
    .join("\n");
}

const SYSTEM_PROMPT =
  "Tu es un assistant de recrutement. On te fournit le PROFIL RÉSUMÉ d'un candidat " +
  "et une liste numérotée d'offres d'emploi. Pour chaque offre, évalue à quel point elle " +
  "correspond au profil, à l'expérience et aux compétences du candidat. " +
  "Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balises Markdown. " +
  'Format exact : [{"i":0,"score":85,"reason":"..."}]. ' +
  '"i" = index de l\'offre, "score" = entier de 0 à 100, ' +
  '"reason" = justification courte en français (12 mots maximum). ' +
  "Inclure TOUTES les offres de la liste.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé ANTHROPIC_API_KEY manquante côté serveur." });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    res.status(400).json({ error: "Corps de requête invalide." });
    return;
  }

  const offers = Array.isArray(body.offers) ? body.offers.slice(0, 60) : [];
  const profile = body.profile;

  if (!profile) {
    res.status(400).json({ error: "Profil manquant (analyse d'abord le CV)." });
    return;
  }
  if (offers.length === 0) {
    res.status(400).json({ error: "Aucune offre à évaluer." });
    return;
  }

  const profileText =
    `Profil : ${profile.headline || ""}\n` +
    `Compétences : ${(profile.skills || []).join(", ")}\n` +
    `Expérience : ${profile.experience || ""}`;

  const userContent = [
    {
      type: "text",
      text:
        profileText +
        "\n\nVoici les offres d'emploi à évaluer :\n\n" +
        buildOffersText(offers),
    },
  ];

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
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    res.status(502).json({ error: "Appel API Claude impossible : " + e.message });
    return;
  }

  if (!apiRes.ok) {
    const txt = await apiRes.text();
    res
      .status(502)
      .json({ error: `API Claude HTTP ${apiRes.status}`, detail: txt.slice(0, 300) });
    return;
  }

  const data = await apiRes.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Nettoie d'éventuelles balises ```json ... ```
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  if (!cleaned.startsWith("[")) {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) cleaned = m[0];
  }

  let scores;
  try {
    scores = JSON.parse(cleaned);
    if (!Array.isArray(scores)) throw new Error("pas un tableau");
  } catch (e) {
    // Null / illisible -> 200 avec scores vides : le front garde l'ordre initial
    res.status(200).json({ scores: [], warning: "Classement indisponible cette fois-ci." });
    return;
  }

  res.status(200).json({ scores });
}
