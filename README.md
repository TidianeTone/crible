# JobTrack

Agrégateur d'offres d'emploi (France Travail + Adzuna + Meteojob) avec analyse de CV,
classement des offres, brouillons de lettres de motivation et adaptation de CV à une offre,
le tout via l'API Claude d'Anthropic. Front en HTML/CSS/JS sans framework, back en fonctions
serverless Vercel.

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
