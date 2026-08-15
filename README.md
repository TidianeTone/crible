# JobTrack

Agrégateur d'offres d'emploi (France Travail + Adzuna + Meteojob) avec analyse de CV,
classement des offres, brouillons de lettres de motivation et adaptation de CV à une offre,
le tout via l'API Claude d'Anthropic. Front en HTML/CSS/JS sans framework, back en fonctions
serverless Vercel.

## Déployer sur Vercel

1. Sur [vercel.com](https://vercel.com) : **Add New → Project → Import Git Repository**, choisir ce dépôt.
2. Laisser les réglages par défaut : Vercel détecte `/api` et sert la racine en statique.
   Ni build command ni output directory à renseigner.
3. Ajouter les 5 variables d'environnement ci-dessous (**Settings → Environment Variables**),
   sur les trois environnements (Production, Preview, Development).
4. Déployer. Chaque `git push` sur `main` redéploie automatiquement.

## Variables d'environnement

Aucune clé ne figure dans le code. Les cinq sont obligatoires côté serveur :

| Variable | Où l'obtenir | Sert à |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Analyse du CV, classement, lettres, adaptation |
| `FT_CLIENT_ID` | [francetravail.io](https://francetravail.io) | Offres France Travail |
| `FT_CLIENT_SECRET` | francetravail.io | Offres France Travail |
| `ADZUNA_APP_ID` | [developer.adzuna.com](https://developer.adzuna.com) | Offres Adzuna |
| `ADZUNA_APP_KEY` | developer.adzuna.com | Offres Adzuna |

Meteojob est interrogé sans clé.

## Développement local

Les routes `/api` ont besoin d'un runtime serverless : un simple serveur de fichiers
statiques ne suffit pas, l'interface se chargera mais tous les appels API renverront 404.

```bash
npm i -g vercel
vercel dev
```

`vercel dev` récupère les variables d'environnement du projet lié et exécute les fonctions
localement sur <http://localhost:3000>.

## Structure

```
index.html      interface
app.js          état, traductions FR/EN, rendu, enchaînement des appels
styles.css      thème (palette brique toulousaine)
api/
  _claude.js    helpers partagés (appel Anthropic, parsing JSON, langue)
  search.js     agrégation France Travail + Adzuna + Meteojob
  profile.js    CV PDF -> profil + expériences structurées   (Haiku)
  match.js      notation des offres selon le profil          (Haiku)
  letter.js     brouillon de lettre de motivation            (Haiku)
  tailor.js     adaptation du CV à une offre, en 3 étapes    (Haiku + Sonnet)
```

## Adaptation du CV — les 3 étapes

Le bouton « Adapter mon CV » enchaîne trois appels distincts, avec affichage progressif :

1. **Regard du recruteur** — le modèle joue un recruteur senior de l'entreprise de l'offre
   et renvoie les 5 mots-clés manquants et les 3 signaux d'alerte repérables en 10 secondes.
2. **Réécriture XYZ** — les expériences sont réécrites selon la formule de Google
   (« Accompli X, mesuré par Y, en faisant Z »), en intégrant les mots-clés et en supprimant
   les signaux d'alerte. C'est l'étape confiée à Sonnet, là où la qualité rédactionnelle compte.
3. **Filtre ATS** — le modèle joue un ATS et un recruteur qui lit 200 CV d'affilée : score,
   verdict, passages qui seraient ignorés, réécritures qui accrochent.

Le résultat s'affiche en comparatif avant / après. Le modèle a interdiction d'inventer un
fait absent du CV : les chiffres qu'il ne connaît pas apparaissent comme `[à chiffrer]`,
à remplir soi-même.

Un résultat est mis en cache par offre : re-cliquer ne relance aucun appel.
Coût indicatif : environ 0,04 € par adaptation.

## Confidentialité

Le PDF du CV n'est stocké nulle part. Il est transmis une seule fois à l'API Claude pour en
extraire un profil et les expériences, puis oublié côté serveur. Le profil extrait reste
uniquement dans le navigateur de l'utilisateur (localStorage) et s'efface via
« Oublier mon CV ».
