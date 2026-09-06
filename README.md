[![Netlify Status](https://api.netlify.com/api/v1/badges/0dfa243e-0ecb-4b2d-b46f-7d03e13faceb/deploy-status)](https://app.netlify.com/projects/kamadvice/deploys)
![quality](https://img.shields.io/badge/quality-trust_me_bro-brightgreen)

# Kamadvice

Aide à la décision pour Dofus : parcourir les items, voir leur recette et ce
qu'ils permettent de crafter, et comparer le prix d'achat au coût de fabrication.

## Architecture

Pas de backend, pas de compte utilisateur — et ce n'est pas une simplification
provisoire, c'est ce que les données permettent :

- **Le catalogue tient dans le navigateur.** Le dump brut fait 41 Mo, mais 90 %
  du poids vient des descriptions et effets en 5 langues. Réduit au français et
  aux champs affichés, l'ensemble items + recettes tombe à **1,7 Mo (~360 Ko
  gzippés)**. Il est donc chargé une fois au démarrage, puis trier, filtrer et
  chiffrer les 17 051 items se fait en mémoire, sans un seul appel réseau.
- **Les prix sont partagés, dans Supabase.** Relever un prix sert à tout le
  monde : la saisie est ouverte, sans compte. Le navigateur écrit directement
  dans Postgres via le SDK du projet, sans serveur intermédiaire — la Row Level
  Security tient les droits (`supabase/schema.sql`), pas un code de backend. La
  table est en ajout seul : deux contributeurs qui relèvent le même item ne
  s'écrasent jamais, ils empilent deux relevés.
- **Les relevés arrivent en direct.** Un canal Realtime diffuse les ajouts et
  les suppressions à tous les onglets ouverts : un prix saisi ailleurs apparaît
  sans rien recharger. Le canal peut se couper sans prévenir, alors les prix
  sont aussi resynchronisés à chaque reconnexion et au retour sur l'onglet.
- **Le navigateur reste le cache.** Les prix courants sont gardés en
  `localStorage` pour que la page s'affiche avant la réponse réseau, et les
  saisies partent en écriture optimiste — l'interface ne fait jamais attendre.
  Un envoi qui échoue est mis de côté et rejoué au retour du réseau. Sans projet
  Supabase configuré, tout fonctionne encore, en local seul.
- **Les icônes viennent de CDN tiers, en cascade.** Aucun asset à héberger.
  `static.ankama.com` d'abord, la source officielle vers laquelle pointe le dump ;
  puis `api.dofusdb.fr` pour les ~17 % d'`iconId` qu'Ankama ne sert pas (403
  AccessDenied) ; puis un marqueur d'absence. Ankama filtre par ailleurs le
  `Referer`, d'où le `referrerPolicy="no-referrer"` dans `ItemIcon`. L'ordre des
  sources se règle en un point : `ICON_BASE_URLS` dans `scripts/build-data.mjs`.

Résultat : un front statique déployable gratuitement partout, et pour toute
infrastructure une table Postgres, qui tient très largement dans l'offre
gratuite de Supabase.

## Structure

```
dofus_data/              Dumps bruts du jeu (source, non servie)
  items.json             MAPPED_ITEMS de dofusdude/dofus3-main
  recipes.json, jobs.json  Assets bruts (dumps Unity) : seuls à porter le jobId
netlify.toml             Configuration de déploiement
supabase/
  schema.sql             Table des relevés, vue des prix courants, RLS
  migrations/            Évolutions à rejouer sur un projet déjà créé
frontend/
  scripts/
    build-data.mjs       ../dofus_data/*.json  ->  public/data/*.json
  public/data/           Artefacts servis au navigateur (versionnés)
    servers/             Emblèmes des serveurs de jeu, <clé>.webp, 64 px
  src/
    domain/
      types.ts           Types du catalogue
      craft.ts           Coût de craft et marge — métier pur, sans React
      carburant.ts       Lignes du tableau de bord des carburants, meilleur
                         rendement par jauge
    data/
      catalog.ts         Chargement + indexation du catalogue
      carburants.ts      Connaissance de jeu : jauges, familles, calibres,
                         paliers — et lecture d'un carburant depuis ses effets
      hdv.ts             Connaissance de jeu : dans quel hôtel de vente se
                         relève chaque item
      supabase.ts        Client du projet, ou null en local seul
      servers.ts         Serveurs de jeu, et celui dont on affiche les prix
      prices.ts          Journal des relevés : lecture, écriture optimiste,
                         temps réel, cache — pour le serveur courant
      priceMigration.ts  Reprise des prix saisis avant le partage
    lib/
      icons.ts           Vocabulaire d'icônes (Lucide) : un concept = une icône
      heat.ts            Carte de chaleur d'une colonne de gains / pertes
      range.ts           Fourchette min/max d'un filtre, lue et écrite dans l'URL
      carburantFilters.ts  Filtres et tri du tableau de bord, portés par l'URL
    components/
      PriceField.tsx     Saisie d'un prix + date du dernier relevé
      PriceHistory.tsx   Journal des relevés d'un item, avec variations
      PriceWizard.tsx    Remplissage assisté : les prix d'une vue un par un,
                         par HDV, nom copié à chaque étape
      TrendIcon.tsx      Flèche de tendance : hausse, baisse, stable, inconnu
      CopyOnAltClick.tsx Alt+clic sur un item (`data-item-name`) copie son nom
      JobIcon.tsx        Icône d'un métier via CDN (DofusDB), pictogramme en repli
      DashboardHeader.tsx  Titre, méthode et chiffres d'un tableau de bord
      Adorned.tsx        Convention de taille des contrôles (FIELD, CONTROL,
                         FIELD_TABLE, BUTTON) + champ à icône
      FilterBar.tsx      Barre de filtres : mot-clé, puces, fourchette, coche
                         (champs texte appliqués après 500 ms de silence)
      TableHead.tsx      En-tête de colonne triable, avec bulle
      ServerPicker.tsx   Choix du serveur de jeu, emblèmes à l'appui
      ServerIcon.tsx     Emblème d'un serveur, badge à l'initiale en repli
    pages/
      ItemsPage.tsx      Liste triable / filtrable (virtualisée)
      ItemPage.tsx       Fiche item : prix, historique, recette, usages
      CarburantPage.tsx  Tableau de bord des 120 carburants d'enclos
      JobsPage.tsx       Les métiers producteurs, en cartes
      JobPage.tsx        Tableau de bord d'un métier : ses recettes face à l'HDV,
                         filtrées par niveau, type, coûts, ingrédients
```

`src/domain/craft.ts` est le cœur métier : pour un item, il donne le prix
d'achat, le coût de fabrication en achetant les ingrédients, les ingrédients dont
le prix manque encore, et la marge à la revente. Il est volontairement pur pour
rester testable et servir de socle aux vues à venir.

Chaque item garde un journal de ses relevés de prix, du plus récent au plus
ancien ; le prix courant est simplement le premier du journal, ce qui évite
d'avoir à tenir un champ « prix actuel » synchronisé avec l'historique. Ressaisir
un prix identique ne crée pas de relevé, et seuls les 50 derniers sont conservés.
La base suit exactement ce modèle : une table en ajout seul, et une vue qui n'en
garde que le relevé le plus récent par item.

Les deux volumes n'étant pas du même ordre, ils ne se chargent pas de la même
façon : les **prix courants** arrivent d'un bloc au démarrage (une ligne par
item, borné par le catalogue), les **journaux** complets seulement à l'ouverture
d'une fiche item. Un champ de prix dans une liste ne déclenche donc aucun appel.

## Base de données (Supabase, gratuit)

1. Créer un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. SQL Editor → coller et exécuter `supabase/schema.sql`. Il crée la table, la
   vue, les politiques RLS, et publie la table sur le canal Realtime.
3. Project Settings → API Keys → relever l'URL du projet et la clé
   **publishable** (`sb_publishable_...`).
4. Copier `frontend/.env.example` en `frontend/.env.local` et y renseigner
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

La clé publiable est publique : elle est incluse dans le bundle, et c'est normal
— les droits sont tenus par la Row Level Security, pas par le secret de la clé.
Sans session Supabase Auth, elle résout vers le rôle `anon`, celui que ciblent
les politiques du schéma.

La clé **secrète** (`sb_secret_...`) n'a aucune place ici : elle contourne la
RLS, et toute variable `VITE_` finit publiée dans le bundle. Supabase la refuse
d'ailleurs depuis un navigateur, avec un 401.

Sans ces variables, l'application démarre quand même et garde les prix dans le
navigateur, sans partage. Les prix déjà saisis en local sont remontés
automatiquement au premier démarrage connecté ; l'opération est rejouable sans
créer de doublons, et les clés locales ne sont jamais effacées.

Un projet créé avant une évolution du schéma rejoue les scripts de
`supabase/migrations/`, dans l'ordre de leurs dates — chacun dit ce qu'il fait
et quand le passer. Celui du 2026-09-06 range sous `imagiro` les relevés
collectés avant le choix du serveur : à exécuter avant de déployer ce front.

Un projet gratuit est mis en pause après 7 jours sans requête :
`.github/workflows/supabase-keepalive.yml` le réveille chaque semaine. Il
attend les secrets de dépôt `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`.

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

4. *Site configuration → Environment variables* : ajouter `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_PUBLISHABLE_KEY`. Elles sont lues au build, pas à l'exécution : les
   modifier impose un redeploy.

## Limites connues

- **La saisie est ouverte et sans modération.** N'importe qui peut relever un
  prix, et le plus récent fait foi. C'est le prix à payer pour se passer de
  comptes ; rien n'est détruit pour autant, la table étant en ajout seul.
- **Le serveur de jeu est un réglage du navigateur.** Les prix affichés sont
  ceux du serveur choisi (accueil ou header), sans synchronisation entre
  machines. La liste des serveurs est une constante (`data/servers.ts`), à
  tenir à jour à l'ouverture ou à la fusion de serveurs — la clé d'un serveur ne
  se renomme jamais, les relevés la portent.
- **Les emblèmes des serveurs sont hébergés ici**, à la différence des icônes
  d'items : aucun CDN ne les sert. `public/data/servers/<clé>.webp`, 64 px,
  réduits depuis les illustrations officielles d'Ankama telles que reprises
  par serveur-liste.com. Un serveur sans fichier a un badge à son initiale.
- **Le SDK pèse ~59 Ko gzippés.** Il n'entre dans le bundle que si les
  variables d'environnement sont renseignées : sans elles, Vite les remplace par
  `undefined` et le client Supabase est éliminé au tree-shaking.
- **Pas d'information de métier** sur les recettes : elle est absente du dump.
- 11 recettes sont ignorées au build, leur résultat n'existant plus dans le
  catalogue (`npm run data` les liste).
