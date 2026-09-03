# Kamadvice

Aide à la décision pour Dofus : parcourir les items, voir leur recette et ce
qu'ils permettent de crafter, et comparer le prix d'achat au coût de fabrication.

## Architecture

Pas de backend, pas de base de données, pas de compte utilisateur — et ce n'est
pas une simplification provisoire, c'est ce que les données permettent :

- **Le catalogue tient dans le navigateur.** Le dump brut fait 41 Mo, mais 90 %
  du poids vient des descriptions et effets en 5 langues. Réduit au français et
  aux champs affichés, l'ensemble items + recettes tombe à **1,7 Mo (~360 Ko
  gzippés)**. Il est donc chargé une fois au démarrage, puis trier, filtrer et
  chiffrer les 17 051 items se fait en mémoire, sans un seul appel réseau.
- **Les prix sont dans `localStorage`.** Ils sont saisis à la main, par une seule
  personne, sur une seule machine : un service distant n'apporterait rien
  aujourd'hui.
- **Les icônes viennent du CDN d'Ankama.** Aucun asset à héberger.

Résultat : un site 100 % statique, déployable gratuitement partout, sans quota à
surveiller.

## Structure

```
dofus_data/              Dumps bruts du jeu (source, non servie)
netlify.toml             Configuration de déploiement
frontend/
  scripts/
    build-data.mjs       ../dofus_data/*.json  ->  public/data/*.json
  public/data/           Artefacts servis au navigateur (versionnés)
  src/
    domain/
      types.ts           Types du catalogue
      craft.ts           Coût de craft et marge — métier pur, sans React
    data/
      catalog.ts         Chargement + indexation du catalogue
      prices.ts          Journal des prix saisis, persisté dans localStorage
    lib/
      icons.ts           Vocabulaire d'icônes (Lucide) : un concept = une icône
    components/
      PriceField.tsx     Saisie d'un prix + date du dernier relevé
      PriceHistory.tsx   Journal des relevés d'un item, avec variations
      TrendIcon.tsx      Flèche de tendance : hausse, baisse, stable, inconnu
    pages/
      ItemsPage.tsx      Liste triable / filtrable (virtualisée)
      ItemPage.tsx       Fiche item : prix, historique, recette, usages
```

`src/domain/craft.ts` est le cœur métier : pour un item, il donne le prix
d'achat, le coût de fabrication en achetant les ingrédients, les ingrédients dont
le prix manque encore, et la marge à la revente. Il est volontairement pur pour
rester testable et servir de socle aux vues à venir.

Chaque item garde un journal de ses relevés de prix, du plus récent au plus
ancien ; le prix courant est simplement le premier du journal, ce qui évite
d'avoir à tenir un champ « prix actuel » synchronisé avec l'historique. Ressaisir
un prix identique ne crée pas de relevé, et seuls les 50 derniers sont conservés.

## Commandes

Tout se lance depuis `frontend/` :

```bash
cd frontend
npm install
npm run data      # régénère public/data/ depuis ../dofus_data/ (après une MAJ Dofus)
npm run dev       # serveur de dev
npm run build     # typecheck + bundle de production dans dist/
npm run preview   # sert dist/ en local
```

## Déploiement (Netlify, gratuit)

`netlify.toml` est déjà configuré : base `frontend`, build `npm run build`,
publication de `frontend/dist`, fallback SPA et cache long sur `/data/*`.

1. Pousser le dépôt sur GitHub.
2. Netlify → *Add new site* → *Import an existing project* → sélectionner le dépôt.
3. Laisser les réglages détectés et déployer. Le site est servi sur un
   sous-domaine `*.netlify.app`.

Aucune variable d'environnement n'est nécessaire.

## Limites connues

- **Les prix sont locaux au navigateur.** Vider les données du site les efface,
  et ils ne se synchronisent pas entre machines.
- **Pas d'information de métier** sur les recettes : elle est absente du dump.
- 11 recettes sont ignorées au build, leur résultat n'existant plus dans le
  catalogue (`npm run data` les liste).
