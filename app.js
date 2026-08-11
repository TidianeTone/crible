"use strict";

// ---- État ----
let lastOffers = [];
let profile = null;

const PROFILE_KEY = "jobtrackProfile";

function loadProfile() {
  try { const raw = localStorage.getItem(PROFILE_KEY); if (raw) profile = JSON.parse(raw); }
  catch (e) { profile = null; }
}
function saveProfileToStorage() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
}
function forgetProfile() {
  profile = null;
  try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
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
    .split(",").map(s => s.trim()).filter(Boolean);
}

// ---- Rendu ----
function matchClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function renderCards(offers) {
  const grid = document.getElementById("results");
  const empty = document.getElementById("emptyState");
  grid.innerHTML = "";

  if (offers.length === 0) {
    empty.classList.remove("hidden");
    empty.querySelector("p").textContent = "Aucune offre trouvée pour cette recherche.";
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
      match.textContent = `✨ ${o.matchScore}% pour toi`;
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

    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = o.description;

    card.append(badge, title, meta);
    if (o.description) card.append(desc);
    if (o.matchReason) {
      const reason = document.createElement("div");
      reason.className = "match-reason";
      reason.textContent = "« " + o.matchReason + " »";
      card.append(reason);
    }

    // Bouton lettre (si profil présent) — dans un <a>, il faut bloquer la navigation
    if (profile) {
      const btn = document.createElement("button");
      btn.className = "letter-btn";
      btn.type = "button";
      btn.textContent = "✉️ Brouillon de lettre";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLetter(idx);
      });
      card.append(btn);
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
    label.textContent = "📄 CV mémorisé ✓";
    hint.textContent = profile.headline ? "Profil : " + profile.headline : "Profil mémorisé.";
    forget.classList.remove("hidden");
    edit.classList.remove("hidden");
  } else {
    label.textContent = "📄 Charger mon CV (PDF)";
    hint.textContent = "Charge ton CV : l'appli trouve et classe les offres pour toi. Ou cherche directement ci-dessous.";
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
  status.textContent = "Recherche en cours…";

  try {
    const params = new URLSearchParams({ keyword, ville, ft: wantFT, adz: wantADZ, mj: wantMJ });
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) throw new Error("serveur HTTP " + res.status);
    const data = await res.json();

    lastOffers = data.offers || [];
    renderCards(lastOffers);
    refreshCvUi();

    let line = `${data.counts.total} offres à ${data.ville || ville} · ${data.counts.ft} France Travail, ${data.counts.adz} Adzuna, ${data.counts.mj} Meteojob`;
    if (data.errors && data.errors.length) line += " · ⚠ " + data.errors.join(" | ");
    status.textContent = line;
    return true;
  } catch (e) {
    status.textContent = "Erreur : " + e.message;
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
  const status = document.getElementById("statusLine");
  status.textContent = "Analyse de ton CV (une seule fois)…";
  const cvBase64 = await fileToBase64(file);
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cvBase64, cvType: "application/pdf" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  if (data.warning) status.textContent = "⚠ " + data.warning;
  return data.profile;
}

// ---- Matching ----
async function runMatch() {
  const btn = document.getElementById("matchBtn");
  const status = document.getElementById("statusLine");
  if (!profile || lastOffers.length === 0) return;

  btn.disabled = true;
  status.textContent = "Classement des offres selon ton profil…";

  try {
    const payload = {
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
    if (data.warning) { status.textContent = "⚠ " + data.warning; }

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
    status.textContent = `Classées pour toi — ${scored.length} offres, les meilleures d'abord.`;
  } catch (e) {
    status.textContent = "Erreur classement : " + e.message;
  } finally {
    refreshCvUi();
  }
}

// ---- Lettre de motivation ----
async function openLetter(idx) {
  const offer = lastOffers[idx];
  if (!offer || !profile) return;

  const modal = document.getElementById("letterModal");
  const txt = document.getElementById("letterText");
  const title = document.getElementById("letterTitle");
  const status = document.getElementById("letterStatus");

  title.textContent = "Brouillon — " + offer.title;
  txt.value = "Rédaction du brouillon en cours…";
  status.textContent = "";
  modal.classList.remove("hidden");

  try {
    const res = await fetch("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        offer: {
          title: offer.title, company: offer.company,
          contract: offer.contract, description: offer.description,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
    txt.value = data.letter || "";
    if (data.warning) status.textContent = "⚠ " + data.warning;
  } catch (e) {
    txt.value = "Erreur : " + e.message;
  }
}

document.getElementById("letterClose").addEventListener("click", () => {
  document.getElementById("letterModal").classList.add("hidden");
});
document.getElementById("letterModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
});
document.getElementById("letterCopy").addEventListener("click", async () => {
  const txt = document.getElementById("letterText");
  const status = document.getElementById("letterStatus");
  try {
    await navigator.clipboard.writeText(txt.value);
    status.textContent = "Copié ✓";
  } catch (e) {
    txt.select();
    document.execCommand("copy");
    status.textContent = "Copié ✓";
  }
  setTimeout(() => (status.textContent = ""), 2000);
});

// ---- Profil : boutons ----
document.getElementById("editProfileBtn").addEventListener("click", () => {
  fillProfileForm();
  document.getElementById("profilePanel").classList.toggle("hidden");
});
document.getElementById("saveProfileBtn").addEventListener("click", () => {
  readProfileForm();
  saveProfileToStorage();
  const s = document.getElementById("profileStatus");
  s.textContent = "Enregistré ✓ (utilisé pour les prochains classements et lettres)";
  setTimeout(() => (s.textContent = ""), 3000);
  refreshCvUi();
});

// ---- Flux automatique : CV -> profil -> recherche -> classement ----
document.getElementById("cvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const p = await analyzeCv(file);
    profile = p;
    saveProfileToStorage();
    fillProfileForm();
    document.getElementById("profilePanel").classList.remove("hidden");
    refreshCvUi();

    const kw = (p.keywords && p.keywords[0]) || "";
    if (kw) document.getElementById("keyword").value = kw;
    const ok = await runSearch();
    if (ok && lastOffers.length > 0) await runMatch();
  } catch (err) {
    document.getElementById("statusLine").textContent = "Erreur analyse CV : " + err.message;
  }
  e.target.value = "";
});

document.getElementById("forgetBtn").addEventListener("click", () => {
  forgetProfile();
  lastOffers.forEach((o) => { delete o.matchScore; delete o.matchReason; });
  renderCards(lastOffers);
  refreshCvUi();
  document.getElementById("statusLine").textContent = "CV oublié.";
});

document.getElementById("matchBtn").addEventListener("click", runMatch);

async function searchAndMaybeMatch() {
  const ok = await runSearch();
  if (ok && profile && lastOffers.length > 0) await runMatch();
}
document.getElementById("searchBtn").addEventListener("click", searchAndMaybeMatch);
document.getElementById("keyword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAndMaybeMatch();
});
document.getElementById("ville").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchAndMaybeMatch();
});

// ---- Init ----
loadProfile();
refreshCvUi();
