"use strict";

// ---- État ----
let lastOffers = [];
let profile = null;
let lang = "fr";
let cvFileName = "";
let hasSearched = false; // distingue « rien cherché » de « aucun résultat »
const tailorCache = new Map(); // clé = url de l'offre -> résultat des 3 étapes

const PROFILE_KEY = "jobtrackProfile";
const LANG_KEY = "jobtrackLang";
const CVNAME_KEY = "jobtrackCvName";

// ---- Traductions ----
const I18N = {
  fr: {
    tagline: "3 sources réunies · classement et lettres par IA",
    cvLoad: "📄 Charger mon CV (PDF)",
    cvLoaded: "📄 CV mémorisé ✓",
    cvHintEmpty: "Charge ton CV : l'appli trouve et classe les offres pour toi. Ou cherche directement ci-dessous.",
    cvHintSaved: "Profil mémorisé.",
    profileToggle: "Voir / modifier mon profil",
    forget: "Oublier mon CV",
    profileIntro: "Ce résumé sert au classement des offres, aux lettres de motivation et à l'adaptation du CV. Corrige-le librement : c'est TA version qui fait foi, pas celle de l'IA.",
    fieldHeadline: "Titre du profil",
    fieldSummary: "Résumé du parcours (~100 mots)",
    fieldSkills: "Compétences (séparées par des virgules)",
    save: "Enregistrer mon profil",
    saved: "Enregistré ✓ (utilisé pour les prochains classements, lettres et adaptations)",
    city: "Ville",
    keyword: "Intitulé du poste — ex. développeur, comptable…",
    search: "Rechercher",
    rank: "✨ Classer selon mon CV",
    emptyStart: "Charge ton CV ou lance une recherche pour voir les offres.",
    emptyNone: "Aucune offre trouvée pour cette recherche.",
    letterTitle: "Brouillon de lettre",
    letterHint: "C'est un brouillon : personnalise-le avant de l'envoyer (une lettre IA brute, ça se repère).",
    close: "Fermer",
    copy: "Copier",
    copied: "Copié ✓",
    madeBy: "Développé par",
    privacy: "🔒 <strong>Confidentialité</strong> — Ton CV n'est jamais stocké sur nos serveurs : le PDF est transmis une seule fois à l'API Claude (Anthropic) pour en extraire un profil et tes expériences, puis oublié côté serveur. Le PDF lui-même n'est conservé nulle part. Le profil extrait reste uniquement dans TON navigateur (localStorage) et s'efface via « Oublier mon CV ». L'hébergeur (Vercel) peut déposer ses propres cookies techniques. Aucune donnée n'est revendue ni partagée au-delà de ces traitements.",

    // Progression
    analyzingTitle: "Analyse de ton CV en cours…",
    analyzingSteps: ["Lecture du PDF", "Extraction du profil et des expériences", "Recherche d'offres", "Classement selon ton profil"],
    rankingTitle: "Classement des offres selon ton profil…",
    rankingSteps: ["Comparaison de chaque offre à ton parcours", "Tri des meilleures offres"],
    searching: "Recherche en cours…",

    // Cartes
    matchBadge: "✨ {n}% pour toi",
    letterBtn: "✉️ Brouillon de lettre",
    tailorBtn: "🎯 Adapter mon CV",
    resultsLine: "{total} offres à {ville} · {ft} France Travail, {adz} Adzuna, {mj} Meteojob",
    rankedLine: "Classées pour toi — {n} offres, les meilleures d'abord.",
    forgotten: "CV oublié.",
    errPrefix: "Erreur : ",
    errRank: "Erreur classement : ",
    errCv: "Erreur analyse CV : ",
    drafting: "Rédaction du brouillon en cours…",
    draftFor: "Brouillon — ",

    // Aperçu CV
    noXp: "Aucune expérience détaillée n'a été extraite : l'adaptation de CV ne sera pas disponible.",
    xpTitle: "Expériences retenues",

    // Adaptation
    tailorTitle: "Adapter mon CV — ",
    tailorStep1: "Regard du recruteur",
    tailorStep2: "Réécriture XYZ",
    tailorStep3: "Filtre ATS",
    auditTitle: "Ce qu'un recruteur voit en 10 secondes",
    missingTitle: "5 mots-clés manquants",
    flagsTitle: "3 signaux d'alerte",
    compareTitle: "Comparatif : ton CV / le CV adapté",
    compareNote: "Rien n'a été inventé. Les mentions [à chiffrer] sont des trous à remplir toi-même avec de vrais chiffres — c'est là que se gagne un entretien.",
    changesTitle: "Ce qui a changé",
    atsTitle: "Passage au crible : ATS + 200 CV d'affilée",
    ignoredTitle: "Ce qui serait ignoré",
    rewritesTitle: "Réécritures qui accrochent",
    before: "Ton CV",
    after: "CV adapté",
    copyCv: "Copier le CV adapté",
    retry: "Relancer",
    atsLabel: "Score ATS estimé :",
    tailorNoXp: "Ton profil ne contient pas d'expériences détaillées. Recharge ton CV (PDF) pour activer l'adaptation.",
  },
  en: {
    tagline: "3 sources combined · AI ranking and cover letters",
    cvLoad: "📄 Upload my CV (PDF)",
    cvLoaded: "📄 CV saved ✓",
    cvHintEmpty: "Upload your CV: the app finds and ranks jobs for you. Or search directly below.",
    cvHintSaved: "Profile saved.",
    profileToggle: "View / edit my profile",
    forget: "Forget my CV",
    profileIntro: "This summary powers job ranking, cover letters and CV tailoring. Edit it freely — YOUR version is the one that counts, not the AI's.",
    fieldHeadline: "Profile headline",
    fieldSummary: "Career summary (~100 words)",
    fieldSkills: "Skills (comma separated)",
    save: "Save my profile",
    saved: "Saved ✓ (used for future ranking, letters and tailoring)",
    city: "City",
    keyword: "Job title — e.g. developer, accountant…",
    search: "Search",
    rank: "✨ Rank against my CV",
    emptyStart: "Upload your CV or run a search to see jobs.",
    emptyNone: "No jobs found for this search.",
    letterTitle: "Cover letter draft",
    letterHint: "This is a draft: personalise it before sending (raw AI letters are easy to spot).",
    close: "Close",
    copy: "Copy",
    copied: "Copied ✓",
    madeBy: "Built by",
    privacy: "🔒 <strong>Privacy</strong> — Your CV is never stored on our servers: the PDF is sent once to the Claude API (Anthropic) to extract a profile and your experience, then forgotten server-side. The PDF itself is kept nowhere. The extracted profile stays only in YOUR browser (localStorage) and is erased via “Forget my CV”. The host (Vercel) may set its own technical cookies. No data is sold or shared beyond these operations.",

    analyzingTitle: "Analysing your CV…",
    analyzingSteps: ["Reading the PDF", "Extracting profile and experience", "Searching for jobs", "Ranking against your profile"],
    rankingTitle: "Ranking jobs against your profile…",
    rankingSteps: ["Comparing each job to your background", "Sorting the best matches first"],
    searching: "Searching…",

    matchBadge: "✨ {n}% match",
    letterBtn: "✉️ Cover letter draft",
    tailorBtn: "🎯 Tailor my CV",
    resultsLine: "{total} jobs in {ville} · {ft} France Travail, {adz} Adzuna, {mj} Meteojob",
    rankedLine: "Ranked for you — {n} jobs, best matches first.",
    forgotten: "CV forgotten.",
    errPrefix: "Error: ",
    errRank: "Ranking error: ",
    errCv: "CV analysis error: ",
    drafting: "Writing the draft…",
    draftFor: "Draft — ",

    noXp: "No detailed experience was extracted: CV tailoring will not be available.",
    xpTitle: "Experience found",

    tailorTitle: "Tailor my CV — ",
    tailorStep1: "Recruiter's eye",
    tailorStep2: "XYZ rewrite",
    tailorStep3: "ATS filter",
    auditTitle: "What a recruiter sees in 10 seconds",
    missingTitle: "5 missing keywords",
    flagsTitle: "3 red flags",
    compareTitle: "Side by side: your CV / the tailored CV",
    compareNote: "Nothing was invented. Any [to quantify] marker is a gap for you to fill with real numbers — that is where interviews are won.",
    changesTitle: "What changed",
    atsTitle: "Under scrutiny: ATS + 200 CVs in a row",
    ignoredTitle: "What would be skipped",
    rewritesTitle: "Rewrites that grab attention",
    before: "Your CV",
    after: "Tailored CV",
    copyCv: "Copy tailored CV",
    retry: "Run again",
    atsLabel: "Estimated ATS score:",
    tailorNoXp: "Your profile has no detailed experience. Re-upload your CV (PDF) to enable tailoring.",
  },
};

function t(key, vars) {
  let s = (I18N[lang] && I18N[lang][key]) != null ? I18N[lang][key] : (I18N.fr[key] || key);
  if (vars && typeof s === "string") {
    for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(vars[k]);
  }
  return s;
}

// ---- Stockage local ----
function loadState() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) profile = JSON.parse(raw);
    const l = localStorage.getItem(LANG_KEY);
    if (l === "fr" || l === "en") lang = l;
    cvFileName = localStorage.getItem(CVNAME_KEY) || "";
  } catch (e) { profile = null; }
}
function saveProfileToStorage() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
}
function forgetProfile() {
  profile = null;
  cvFileName = "";
  tailorCache.clear();
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(CVNAME_KEY);
  } catch (e) {}
}

// ---- Bascule de langue ----
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  document.getElementById("langFr").classList.toggle("is-active", lang === "fr");
  document.getElementById("langEn").classList.toggle("is-active", lang === "en");

  // Les contenus construits en JS ne sont pas couverts par data-i18n.
  renderCards(lastOffers);
  renderCvCard();
  refreshCvUi();
}

function setLang(next) {
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  tailorCache.clear(); // les résultats mis en cache sont dans l'ancienne langue
  applyLang();
}

// ---- Panneau profil éditable ----
function fillProfileForm() {
  if (!profile) return;
  document.getElementById("profHeadline").value = profile.headline || "";
  document.getElementById("profSummary").value = profile.summary || "";
  document.getElementById("profSkills").value = (profile.skills || []).join(", ");
}
function readProfileForm() {
  profile = profile || {};
  profile.headline = document.getElementById("profHeadline").value.trim();
  profile.summary = document.getElementById("profSummary").value.trim();
  profile.skills = document.getElementById("profSkills").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(profile.experiences)) profile.experiences = [];
}

// ---- Aperçu visuel du CV ----
function hasExperiences() {
  return !!(profile && Array.isArray(profile.experiences) && profile.experiences.length > 0);
}

function renderCvCard() {
  const card = document.getElementById("cvCard");
  if (!profile) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");

  document.getElementById("cvCardTitle").textContent = profile.headline || t("cvLoaded");
  document.getElementById("cvCardFile").textContent = cvFileName;
  document.getElementById("cvCardSummary").textContent = profile.summary || "";

  const skills = document.getElementById("cvCardSkills");
  skills.innerHTML = "";
  (profile.skills || []).forEach((s) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = s;
    skills.append(chip);
  });

  const xp = document.getElementById("cvCardXp");
  xp.innerHTML = "";
  if (hasExperiences()) {
    const h = document.createElement("h4");
    h.textContent = t("xpTitle");
    xp.append(h);
    profile.experiences.forEach((e) => {
      const row = document.createElement("div");
      row.className = "xp-row";
      const role = document.createElement("strong");
      role.textContent = e.role || "—";
      const meta = document.createElement("span");
      meta.textContent = [e.company, e.period].filter(Boolean).join(" · ");
      row.append(role, meta);
      xp.append(row);
    });
  }
  document.getElementById("cvCardNoXp").classList.toggle("hidden", hasExperiences());
}

// ---- Panneau de progression ----
function showProgress(titleKey, stepsKey) {
  const box = document.getElementById("progress");
  document.getElementById("progressTitle").textContent = t(titleKey);
  const ul = document.getElementById("progressSteps");
  ul.innerHTML = "";
  (t(stepsKey) || []).forEach((label, i) => {
    const li = document.createElement("li");
    li.textContent = label;
    li.className = i === 0 ? "is-active" : "";
    ul.append(li);
  });
  box.classList.remove("hidden");
}
function progressStep(i) {
  const items = document.querySelectorAll("#progressSteps li");
  items.forEach((li, k) => {
    li.classList.toggle("is-done", k < i);
    li.classList.toggle("is-active", k === i);
  });
}
function hideProgress() {
  document.getElementById("progress").classList.add("hidden");
}
function setResultsBusy(busy) {
  document.getElementById("results").classList.toggle("is-busy", !!busy);
}

// ---- Rendu des offres ----
function matchClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function renderCards(offers) {
  const grid = document.getElementById("results");
  const empty = document.getElementById("emptyState");
  grid.innerHTML = "";

  if (!offers || offers.length === 0) {
    empty.querySelector("p").textContent = t(hasSearched ? "emptyNone" : "emptyStart");
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  offers.forEach((o, idx) => {
    const card = document.createElement("a");
    card.href = o.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const cls =
      o.source === "Meteojob" ? "src-mj" :
      o.source === "Adzuna" ? "src-adz" : "src-ft";
    card.className = "card " + cls;

    if (typeof o.matchScore === "number") {
      const match = document.createElement("span");
      match.className = "match " + matchClass(o.matchScore);
      match.textContent = t("matchBadge", { n: o.matchScore });
      card.append(match);
    }

    const badgeCls =
      o.source === "Meteojob" ? "mj" :
      o.source === "Adzuna" ? "adz" : "ft";
    const badge = document.createElement("span");
    badge.className = "badge " + badgeCls;
    badge.textContent = o.source;

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = o.title;

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const bits = [o.company, o.contract, o.hours].filter(Boolean).join(" · ");
    meta.append(document.createTextNode(bits));
    if (o.salary) {
      if (bits) meta.append(document.createTextNode(" · "));
      const sal = document.createElement("span");
      sal.className = "salary";
      sal.textContent = o.salary;
      meta.append(sal);
    }

    card.append(badge, title, meta);
    if (o.description) {
      const desc = document.createElement("div");
      desc.className = "card-desc";
      desc.textContent = o.description;
      card.append(desc);
    }
    if (o.matchReason) {
      const reason = document.createElement("div");
      reason.className = "match-reason";
      reason.textContent = "« " + o.matchReason + " »";
      card.append(reason);
    }

    // Actions IA (si profil présent) — dans un <a>, il faut bloquer la navigation.
    if (profile) {
      const row = document.createElement("div");
      row.className = "card-actions";

      const letterBtn = document.createElement("button");
      letterBtn.className = "letter-btn";
      letterBtn.type = "button";
      letterBtn.textContent = t("letterBtn");
      letterBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); openLetter(idx);
      });
      row.append(letterBtn);

      const tailorBtn = document.createElement("button");
      tailorBtn.className = "tailor-btn";
      tailorBtn.type = "button";
      tailorBtn.textContent = t("tailorBtn");
      tailorBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation(); openTailor(idx);
      });
      row.append(tailorBtn);

      card.append(row);
    }

    grid.append(card);
  });
}

// ---- UI état CV ----
function refreshCvUi() {
  const label = document.getElementById("cvBtnText");
  const hint = document.getElementById("cvHint");
  const forget = document.getElementById("forgetBtn");
  const edit = document.getElementById("editProfileBtn");
  const matchBtn = document.getElementById("matchBtn");

  if (profile) {
    label.textContent = t("cvLoaded");
    hint.textContent = profile.headline || t("cvHintSaved");
    forget.classList.remove("hidden");
    edit.classList.remove("hidden");
  } else {
    label.textContent = t("cvLoad");
    hint.textContent = t("cvHintEmpty");
    forget.classList.add("hidden");
    edit.classList.add("hidden");
    document.getElementById("profilePanel").classList.add("hidden");
  }
  matchBtn.disabled = !(profile && lastOffers.length > 0);
}

// ---- Recherche ----
async function runSearch() {
  const keyword = document.getElementById("keyword").value.trim();
  const ville = document.getElementById("ville").value.trim() || "Toulouse";
  const status = document.getElementById("statusLine");
  const btn = document.getElementById("searchBtn");
  const wantFT = document.getElementById("srcFT").checked ? "1" : "0";
  const wantADZ = document.getElementById("srcADZ").checked ? "1" : "0";
  const wantMJ = document.getElementById("srcMJ").checked ? "1" : "0";

  btn.disabled = true;
  status.textContent = t("searching");

  try {
    const params = new URLSearchParams({ keyword, ville, ft: wantFT, adz: wantADZ, mj: wantMJ });
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error("serveur HTTP " + res.status);
    const data = await res.json();

    lastOffers = data.offers || [];
    hasSearched = true;
    tailorCache.clear();
    renderCards(lastOffers);
    refreshCvUi();

    let line = t("resultsLine", {
      total: data.counts.total, ville: data.ville || ville,
      ft: data.counts.ft, adz: data.counts.adz, mj: data.counts.mj,
    });
    if (data.errors && data.errors.length) line += " · ⚠ " + data.errors.join(" | ");
    status.textContent = line;
    return true;
  } catch (e) {
    status.textContent = t("errPrefix") + e.message;
    return false;
  } finally {
    btn.disabled = false;
  }
}

// ---- Analyse du CV ----
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("lecture du fichier impossible"));
    r.readAsDataURL(file);
  });
}

async function analyzeCv(file) {
  const cvBase64 = await fileToBase64(file);
  progressStep(1);
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cvBase64, cvType: "application/pdf", lang }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  if (data.warning) document.getElementById("statusLine").textContent = "⚠ " + data.warning;
  return data.profile;
}

// ---- Classement ----
async function runMatch(silent) {
  const btn = document.getElementById("matchBtn");
  const status = document.getElementById("statusLine");
  if (!profile || lastOffers.length === 0) return;

  btn.disabled = true;
  setResultsBusy(true);
  if (!silent) showProgress("rankingTitle", "rankingSteps");

  try {
    const payload = {
      lang,
      profile,
      offers: lastOffers.slice(0, 60).map((o) => ({
        title: o.title, company: o.company, contract: o.contract, description: o.description,
      })),
    };
    const res = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    if (data.warning) status.textContent = "⚠ " + data.warning;

    if (!silent) progressStep(1);

    const scored = lastOffers.slice(0, 60);
    (data.scores || []).forEach((s) => {
      if (s && typeof s.i === "number" && scored[s.i]) {
        scored[s.i].matchScore = Math.max(0, Math.min(100, Math.round(s.score)));
        scored[s.i].matchReason = s.reason || "";
      }
    });
    scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    lastOffers = scored;
    renderCards(lastOffers);
    if (!data.warning) status.textContent = t("rankedLine", { n: scored.length });
  } catch (e) {
    status.textContent = t("errRank") + e.message;
  } finally {
    setResultsBusy(false);
    if (!silent) hideProgress();
    refreshCvUi();
  }
}

// ---- Lettre de motivation ----
async function openLetter(idx) {
  const offer = lastOffers[idx];
  if (!offer || !profile) return;

  const modal = document.getElementById("letterModal");
  const txt = document.getElementById("letterText");

  document.getElementById("letterTitle").textContent = t("draftFor") + offer.title;
  txt.value = t("drafting");
  document.getElementById("letterStatus").textContent = "";
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang, profile,
        offer: { title: offer.title, company: offer.company, contract: offer.contract, description: offer.description },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    txt.value = data.letter || "";
    if (data.warning) document.getElementById("letterStatus").textContent = "⚠ " + data.warning;
  } catch (e) {
    txt.value = t("errPrefix") + e.message;
  }
}

// ---- Adaptation du CV (3 étapes enchaînées) ----
let tailorOffer = null;

function tailorReset() {
  document.getElementById("tailorError").classList.add("hidden");
  ["tailorAudit", "tailorCompare", "tailorAts"].forEach((id) =>
    document.getElementById(id).classList.add("hidden"));
  document.querySelectorAll("#tailorSteps li").forEach((li) => {
    li.classList.remove("is-active", "is-done");
  });
  document.getElementById("tailorCopy").disabled = true;
  document.getElementById("tailorRetry").classList.add("hidden");
  document.getElementById("tailorStatus").textContent = "";
}

function tailorStepState(n, state) {
  const li = document.querySelector(`#tailorSteps li[data-step="${n}"]`);
  if (!li) return;
  li.classList.toggle("is-active", state === "active");
  li.classList.toggle("is-done", state === "done");
}

function tailorFail(msg) {
  const box = document.getElementById("tailorError");
  box.textContent = msg;
  box.classList.remove("hidden");
  document.getElementById("tailorRetry").classList.remove("hidden");
  document.querySelectorAll("#tailorSteps li.is-active").forEach((li) => li.classList.remove("is-active"));
}

async function tailorCall(step, extra) {
  const res = await fetch("/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({
      step, lang, profile,
      offer: {
        title: tailorOffer.title, company: tailorOffer.company,
        contract: tailorOffer.contract, description: tailorOffer.description,
      },
    }, extra || {})),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

function renderPairs(ulId, items, keyField, valField, prefix) {
  const ul = document.getElementById(ulId);
  ul.innerHTML = "";
  items.forEach((it) => {
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = (prefix || "") + it[keyField];
    const span = document.createElement("span");
    span.textContent = it[valField];
    li.append(strong, span);
    ul.append(li);
  });
}

function xpBlock(exp) {
  const box = document.createElement("div");
  const head = document.createElement("div");
  head.className = "diff-head";
  head.textContent = [exp.role, exp.company, exp.period].filter(Boolean).join(" · ");
  box.append(head);
  const ul = document.createElement("ul");
  (exp.bullets || []).forEach((b) => {
    const li = document.createElement("li");
    li.textContent = b;
    ul.append(li);
  });
  box.append(ul);
  return box;
}

function renderCompare(before, after) {
  const wrap = document.getElementById("tailorDiff");
  wrap.innerHTML = "";
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "diff-row";

    const left = document.createElement("div");
    left.className = "diff-col before";
    const lh = document.createElement("span");
    lh.className = "diff-label";
    lh.textContent = t("before");
    left.append(lh);
    if (before[i]) left.append(xpBlock(before[i]));

    const right = document.createElement("div");
    right.className = "diff-col after";
    const rh = document.createElement("span");
    rh.className = "diff-label";
    rh.textContent = t("after");
    right.append(rh);
    if (after[i]) right.append(xpBlock(after[i]));

    row.append(left, right);
    wrap.append(row);
  }
}

function renderAts(data) {
  const score = document.getElementById("atsScore");
  if (typeof data.atsScore === "number") {
    score.textContent = t("atsLabel") + " " + data.atsScore + "/100";
    score.className = "ats-score " + matchClass(data.atsScore);
  } else {
    score.textContent = "";
    score.className = "ats-score";
  }
  document.getElementById("atsVerdict").textContent = data.verdict || "";
  renderPairs("atsIgnored", data.ignored || [], "section", "why", "");

  const wrap = document.getElementById("atsRewrites");
  wrap.innerHTML = "";
  (data.rewrites || []).forEach((r) => {
    const row = document.createElement("div");
    row.className = "diff-row";
    const left = document.createElement("div");
    left.className = "diff-col before";
    left.innerHTML = "";
    const lh = document.createElement("span");
    lh.className = "diff-label";
    lh.textContent = r.section || t("before");
    const lp = document.createElement("p");
    lp.textContent = r.before;
    left.append(lh, lp);

    const right = document.createElement("div");
    right.className = "diff-col after";
    const rh = document.createElement("span");
    rh.className = "diff-label";
    rh.textContent = t("after");
    const rp = document.createElement("p");
    rp.textContent = r.after;
    right.append(rh, rp);

    row.append(left, right);
    wrap.append(row);
  });
}

function renderTailor(result) {
  document.getElementById("tailorAudit").classList.remove("hidden");
  renderPairs("tailorKeywords", result.audit.missingKeywords || [], "keyword", "why", "");
  renderPairs("tailorFlags", result.audit.redFlags || [], "flag", "fix", "");
  tailorStepState(1, "done");

  document.getElementById("tailorCompare").classList.remove("hidden");
  renderCompare(profile.experiences || [], result.experiences || []);
  const ul = document.getElementById("tailorChanges");
  ul.innerHTML = "";
  (result.changes || []).forEach((c) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = c;
    li.append(span);
    ul.append(li);
  });
  tailorStepState(2, "done");

  if (result.ats) {
    document.getElementById("tailorAts").classList.remove("hidden");
    renderAts(result.ats);
    tailorStepState(3, "done");
  }
  document.getElementById("tailorCopy").disabled = false;
}

async function runTailor() {
  const key = tailorOffer.url;
  tailorReset();

  const cached = tailorCache.get(key);
  if (cached) { renderTailor(cached); return; }

  const result = {};
  try {
    tailorStepState(1, "active");
    const audit = await tailorCall(1);
    result.audit = audit;
    document.getElementById("tailorAudit").classList.remove("hidden");
    renderPairs("tailorKeywords", audit.missingKeywords || [], "keyword", "why", "");
    renderPairs("tailorFlags", audit.redFlags || [], "flag", "fix", "");
    tailorStepState(1, "done");

    tailorStepState(2, "active");
    const rewrite = await tailorCall(2, { audit });
    result.experiences = rewrite.experiences;
    result.changes = rewrite.changes;
    document.getElementById("tailorCompare").classList.remove("hidden");
    renderCompare(profile.experiences || [], rewrite.experiences || []);
    const ul = document.getElementById("tailorChanges");
    ul.innerHTML = "";
    (rewrite.changes || []).forEach((c) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = c;
      li.append(span);
      ul.append(li);
    });
    tailorStepState(2, "done");
    document.getElementById("tailorCopy").disabled = false;

    tailorStepState(3, "active");
    const ats = await tailorCall(3, { experiences: rewrite.experiences });
    result.ats = ats;
    document.getElementById("tailorAts").classList.remove("hidden");
    renderAts(ats);
    tailorStepState(3, "done");

    tailorCache.set(key, result);
  } catch (e) {
    tailorFail(t("errPrefix") + e.message);
    // Une étape 3 ratée ne doit pas jeter les étapes 1 et 2 déjà obtenues.
    if (result.experiences) tailorCache.set(key, result);
  }
}

function openTailor(idx) {
  const offer = lastOffers[idx];
  if (!offer || !profile) return;

  tailorOffer = offer;
  document.getElementById("tailorTitle").textContent = t("tailorTitle") + offer.title;
  document.getElementById("tailorModal").classList.remove("hidden");

  if (!hasExperiences()) {
    tailorReset();
    tailorFail(t("tailorNoXp"));
    document.getElementById("tailorRetry").classList.add("hidden");
    return;
  }
  runTailor();
}

function tailoredCvText() {
  const key = tailorOffer && tailorOffer.url;
  const result = key ? tailorCache.get(key) : null;
  if (!result || !result.experiences) return "";
  return result.experiences
    .map((e) => {
      const head = [e.role, e.company, e.period].filter(Boolean).join(" — ");
      return head + "\n" + (e.bullets || []).map((b) => "• " + b).join("\n");
    })
    .join("\n\n");
}

// ---- Copie presse-papier ----
async function copyText(text, statusEl) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  statusEl.textContent = t("copied");
  setTimeout(() => (statusEl.textContent = ""), 2000);
}

// ---- Câblage ----
document.getElementById("langFr").addEventListener("click", () => setLang("fr"));
document.getElementById("langEn").addEventListener("click", () => setLang("en"));

document.getElementById("letterClose").addEventListener("click", () => {
  document.getElementById("letterModal").classList.add("hidden");
});
document.getElementById("letterModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});
document.getElementById("letterCopy").addEventListener("click", () => {
  copyText(document.getElementById("letterText").value, document.getElementById("letterStatus"));
});

document.getElementById("tailorClose").addEventListener("click", () => {
  document.getElementById("tailorModal").classList.add("hidden");
});
document.getElementById("tailorModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});
document.getElementById("tailorCopy").addEventListener("click", () => {
  const txt = tailoredCvText();
  if (txt) copyText(txt, document.getElementById("tailorStatus"));
});
document.getElementById("tailorRetry").addEventListener("click", () => {
  if (tailorOffer) { tailorCache.delete(tailorOffer.url); runTailor(); }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.getElementById("letterModal").classList.add("hidden");
  document.getElementById("tailorModal").classList.add("hidden");
});

document.getElementById("editProfileBtn").addEventListener("click", () => {
  fillProfileForm();
  document.getElementById("profilePanel").classList.toggle("hidden");
});
document.getElementById("saveProfileBtn").addEventListener("click", () => {
  readProfileForm();
  saveProfileToStorage();
  tailorCache.clear();
  const s = document.getElementById("profileStatus");
  s.textContent = t("saved");
  setTimeout(() => (s.textContent = ""), 3000);
  renderCvCard();
  refreshCvUi();
});

// ---- Flux automatique : CV -> profil -> recherche -> classement ----
document.getElementById("cvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  showProgress("analyzingTitle", "analyzingSteps");
  try {
    const p = await analyzeCv(file);
    profile = p;
    cvFileName = file.name;
    tailorCache.clear();
    saveProfileToStorage();
    try { localStorage.setItem(CVNAME_KEY, cvFileName); } catch (err) {}
    fillProfileForm();
    renderCvCard();
    refreshCvUi();

    const kw = (p.keywords && p.keywords[0]) || "";
    if (kw) document.getElementById("keyword").value = kw;

    progressStep(2);
    const ok = await runSearch();
    if (ok && lastOffers.length > 0) {
      progressStep(3);
      await runMatch(true);
    }
  } catch (err) {
    document.getElementById("statusLine").textContent = t("errCv") + err.message;
  } finally {
    hideProgress();
    e.target.value = "";
  }
});

document.getElementById("forgetBtn").addEventListener("click", () => {
  forgetProfile();
  lastOffers.forEach((o) => { delete o.matchScore; delete o.matchReason; });
  renderCards(lastOffers);
  renderCvCard();
  refreshCvUi();
  document.getElementById("statusLine").textContent = t("forgotten");
});

document.getElementById("matchBtn").addEventListener("click", () => runMatch(false));

async function searchAndMaybeMatch() {
  const ok = await runSearch();
  if (ok && profile && lastOffers.length > 0) await runMatch(false);
}
document.getElementById("searchBtn").addEventListener("click", searchAndMaybeMatch);
document.getElementById("keyword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAndMaybeMatch();
});
document.getElementById("ville").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAndMaybeMatch();
});

// ---- Init ----
loadState();
applyLang();
renderCvCard();
