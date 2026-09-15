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
  mounts.json            Dump brut des montures : lie une monture à son certificat
  breeding.json          Relevé communautaire (dofuspourlesnoobs.com) : génération
                         et croisements de chaque variété — absent de tout dump
netlify.toml             Configuration de déploiement
supabase/
  schema.sql             Table des relevés, vue des prix courants, RLS
  migrations/            Évolutions à rejouer sur un projet déjà créé
frontend/
  scripts/
    build-data.mjs       ../dofus_data/*.json  ->  public/data/*.json
    fetch-mounts.mjs     Télécharge mounts.json et relève breeding.json
  public/data/           Artefacts servis au navigateur (versionnés)
    servers/             Emblèmes des serveurs de jeu, <clé>.webp, 64 px
  src/
    domain/
      types.ts           Types du catalogue
      craft.ts           Coût de craft et marge — métier pur, sans React
      carburant.ts       Lignes du tableau de bord des carburants, meilleur
                         rendement par jauge
      breeding.ts        Plan d'élevage : arbre des croisements, avancement,
                         probabilités, tentatives et coût — métier pur
    data/
      catalog.ts         Chargement + indexation du catalogue
      carburants.ts      Connaissance de jeu : jauges, familles, calibres,
                         paliers — et lecture d'un carburant depuis ses effets
      mounts.ts          Connaissance de jeu : espèces, jauges de fécondité,
                         réglages par défaut d'un plan, lecture des Makina
      inventory.ts       L'étable : montures possédées, partagées par les plans ;
                         accouplements et clonages s'y enregistrent
      plans.ts           Plans d'élevage sauvegardés : cible, réglages, recettes imposées
      hdv.ts             Connaissance de jeu : dans quel hôtel de vente se
                         relève chaque item
      supabase.ts        Client du projet, ou null en local seul
      servers.ts         Serveurs de jeu, et celui dont on affiche les prix
      audience.ts        Fréquentation : présents (Realtime Presence) et
                         navigateurs distincts (fonction SQL, table fermée)
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
      MountVariety.tsx   Une variété de monture : icône, nom, pastille de génération
      MountGenealogy.tsx Section généalogie de la fiche d'une monture : parents,
                         décomposition jusqu'aux gén. 1, ce qu'elle permet d'obtenir
      BreedingTree.tsx   Arbre repliable d'un plan, provenance de chaque monture
      StablePanel.tsx    L'étable à modifier sur place : sexe, niveau, stérile,
                         arbre réel replié, ce que le plan en fait
    pages/
      ItemsPage.tsx      Liste triable / filtrable (virtualisée)
      ItemPage.tsx       Fiche item : prix, historique, recette, usages
      CarburantPage.tsx  Tableau de bord des 120 carburants d'enclos
      JobsPage.tsx       Les métiers producteurs, en cartes
      JobPage.tsx        Tableau de bord d'un métier : ses recettes face à l'HDV,
                         filtrées par niveau, type, coûts, ingrédients
      BreedingPage.tsx   Élevage : créer un plan, retrouver ceux en cours, l'étable
      PlanPage.tsx       Un plan : prochaine étape suggérée, réglages, coût du
                         plan actuel, croisements restants, étable, arbre complet
```

## Élevage des montures

L'assistant (`/dashboard/elevage`) part d'une variété visée — dragodinde,
muldo ou volkorne — et la déroule sur **l'étable**, la liste des montures
possédées (variété, sexe, niveau, féconde, stérile, arbre réel), partagée par
tous les plans. Un plan ne retient que sa cible et ses réglages : tout le
reste se recalcule sur l'étable à chaque rendu.

- **À chaque emplacement de l'arbre**, la monture de l'étable qui convient si
  elle existe (sexe compatible avec l'autre parent, la plus avancée d'abord),
  sinon la façon la moins chère de l'obtenir : clonage d'une copie stérile,
  croisement, ou capture. Quand une variété a plusieurs recettes, celle que
  l'étable rend la moins chère est retenue — comptée en points de jauge à
  verser, pour ne pas dépendre d'un prix.
- **« Prochaine étape suggérée »**, une seule action, à l'échelle d'un enclos
  (10 montures, cinq couples, par enclos), et en cycles que rien ne mémorise
  — chaque étape se lit dans l'étable, préparée ou non, stérile ou non :
  1. **Accoupler** dès qu'un couple préparé existe, la génération la plus
     haute d'abord (c'est la plus dure à obtenir), puis l'ordre des étapes,
     cinq couples par enclos au plus ; ce qu'il reste à préparer se revoit
     après. La vague ne s'interrompt pas : les bébés naissent à préparer, une
     survivante aussi, aucun nouveau couple n'apparaît avant la fécondation
     suivante. Deux montures préparées vont ensemble plutôt que chacune avec
     une monture à préparer.
  2. **Cloner** ce dont la survivante complète un couple — l'autre parent est
     là, ou se capture. Les autres stériles attendent une vraie occasion.
  3. **Capturer** de quoi porter à **cinq par enclos les couples possibles**,
     préparés ou non : le bas de l'arbre d'abord, par tours — un exemplaire de chaque
     emplacement, puis le deuxième de chacun —, le sexe imposé seulement
     quand une monture d'en face attend un partenaire, libre sinon. Cinq
     couples priment sur dix montures : si les captures penchent d'un côté,
     le lot redemande l'autre sexe. À ajouter au compte-gouttes avec ♂ ♀,
     chaque ajout recalcule le lot.
  4. **Préparer les enclos** : dix montures par enclos à faire monter —
     celles qui font couple d'abord —, « Préparée » sur chacune ou d'un coup ;
     au-delà, la suite attend la vague suivante. Puis retour en 1.
  **Les étapes** sont celles de la recette théorique, toutes, par couches,
  le bas de l'arbre d'abord, dans un ordre et avec des numéros qui ne
  bougent pas — l'étable dit « visée pour l'étape 3 » avec le même 3. Une
  étape faite se coche sur place ; une étape couverte par une monture plus
  haut aussi, grisée ; une étape réglée par un clonage le dit. Le cercle
  d'une étape compte ses parents préparés, pas seulement présents.
- **Niveau d'éleveur** (celui du joueur, gardé dans le navigateur —
  `data/breeder.ts` — et commun à tous les plans) : un enclos jusqu'au niveau
  39, un de plus tous les quarante niveaux, six au niveau 200
  (`enclosuresFor`). Chaque enclos prépare dix montures et accouple cinq
  couples à la fois ; la fécondation les liste enclos par enclos.
- **Le temps restant** (`estimateTime`), à côté du coût : trois jauges de
  fécondité de 20 000 points et la mangeoire, deux jauges à la fois à un
  point par seconde, tout l'enclos ensemble — 40 000 secondes par plein
  d'enclos tant que la mangeoire tient en 20 000. Par vagues de dix montures
  par enclos ; une monture à faire naître attend ses parents préparés, le
  bas de l'arbre passe d'abord.
- **Les sorties d'un accouplement** (`possibleOffspring`), pour renseigner
  le bébé : les deux parents, et toute variété dont une recette marie un
  ancêtre d'un côté — parents et grands-parents compris — à un ancêtre de
  l'autre ; une génération 1 présente dans les deux arbres. C'est ce que
  l'écran du jeu liste ; leur répartition, elle, n'est pas publiée.
- **« ≈ en moyenne »** à côté des nombres arrondis du nombre probable :
  `1 / chance` sans arrondi, fractionnaire, pour l'ordre de grandeur —
  52 % et 70 % font tous deux 2 tentatives arrondies, mais 1,9 et 1,4 en
  moyenne. Sur les accouplements, les captures et le coût.
- **Le carburant nourrit tout l'enclos** : les points de jauge et leur prix se
  partagent entre dix montures (`ENCLOSURE_CAPACITY`), le joueur ne les fait
  pas évoluer une par une.
- **« Préparée »** : jauges faites, prête à reproduire. Une capture, un bébé
  ou une survivante de clonage arrive à préparer, et compte sa préparation
  dans le coût jusqu'à la case cochée ; une monture préparée ne coûte plus
  rien. Cocher la monte au niveau visé du plan si elle est en dessous —
  préparer, c'est la mangeoire jusqu'au niveau, puis les jauges. Le plan suit
  ce booléen, pas les jauges elles-mêmes.
- **Accoupler** enregistre le résultat réel (variété et sexe du bébé) : les
  parents deviennent stériles — matière à clonage —, le bébé rejoint
  l'étable au niveau 1, à préparer, avec ses parents déduits, et le plan se
  recalcule. Rien n'est attribué pour de bon : « visée pour l'étape 3 » dit
  ce que le plan ferait aujourd'hui de la monture, et un bébé inattendu peut
  redistribuer les rôles. Un bébé raté n'est pas une branche à refaire : il
  sert ailleurs, ou au clonage.
- **Seconde chance** : un bébé raté porte les gènes de ses deux parents
  directs. Une Amande et Rousse née d'Ébène × Indigo tient le rôle d'Ébène
  (ou d'Indigo) dans un nouveau croisement, et peut redonner Ébène et Indigo.
  Le plan emploie ces porteuses quand la variété elle-même manque, et le dit
  (« porte Ébène »). C'est sa génération la plus haute qui compte — la
  sienne ou celle d'un parent : une montante, dont un parent est d'une
  génération supérieure à la sienne, ne sert jamais comme elle-même, même
  si elle y conviendrait, et une porteuse ne sert qu'un croisement d'une
  génération strictement supérieure à ce qu'elle vaut (retenter vers le
  haut, jamais recréer son calibre — ses parents font ça aussi bien). Une
  monture que le plan emploie telle quelle n'est jamais détournée en
  porteuse. Seuls les parents directs comptent ; les grands-parents ne sont
  plus ni saisis ni lus.
- **Cloner** : deux montures de même espèce et génération se détruisent pour
  en rendre une, fertile, tirée au sort à 50/50 — même sexe, mêmes parents,
  mais niveau 1 et jauges à zéro. La survivante arrive à préparer et rejoint
  l'enclos suivant. Proposé par lots (jusqu'à cinq), quand il n'y a plus de couple
  préparé et **avant** de recapturer, seulement si sa survivante complète
  un couple à venir. Un clonage n'est planifié que s'il revient moins cher que refaire
  la monture ; la meilleure partenaire est une stérile dont la survie
  servirait aussi (les deux issues sont bonnes), sinon une qui ne sert à rien
  d'autre ; jamais les deux parents stériles d'un même croisement, jamais une
  féconde utile.
- **Niveau visé et points de mangeoire** sont les deux faces de la table d'XP
  (`meta.json`, `mountXp`, relevée sur la page des dragodindes) : niveau 39 =
  19 266 points, 200 = 867 582. Le défaut est 20 000 points — un plein de
  jauge, ce qu'on verse en pratique —, soit le niveau 39. Ces champs, comme
  le niveau d'une monture de l'enclos, passent par `NumberInput` : la valeur
  ne remonte qu'après un temps de silence, le plan ne se recalcule pas à
  chaque frappe.
- **« Nombre probable »** (réglage du plan) : chaque croisement se prévoit en
  `1 / chance` tentatives, arrondi en montant dès que la fraction dépasse 0,3
  (40 % → 3, 52 % → 2, 70 % → 2, 80 % → 1), et chaque tentative consomme un
  couple — ses parents sont à prévoir d'autant, une monture possédée
  couvrant une unité. Sans cascade d'un étage à l'autre : les échecs plus bas
  sont absorbés par le réemploi des bébés ratés et le clonage. Captures,
  rangs d'ancêtres, Optimakinas et coût suivent. Décoché : une tentative par
  croisement. Une monture en place n'en couvre qu'une : les copies en stock —
  même variété, même sexe, fécondes — deviennent sa **réserve**, et s'il en
  manque encore l'emplacement garde un **croisement de plus** en dessous, qui
  fait les suivantes avec ce que l'étable a ou capture. C'est ce qui tient la
  base occupée — accoupler des générations 1 pendant que le haut de l'arbre
  se joue — au lieu d'attendre qu'un échec vide l'emplacement ; un croisement
  dont les deux parents ont de la réserve fournit plusieurs couples d'un
  coup. Les besoins ne se multiplient pas pour autant : chaque emplacement
  n'a toujours qu'un croisement.
- **Rangs d'ancêtres**, en accordéon : les parents, puis les grands-parents,
  puis… — chaque rang ne compte que les emplacements exactement à cette
  profondeur (une génération 1 rencontrée plus haut n'y redescend pas), en
  cartes groupées par variété, avec ♂ ♀ pour ajouter d'un clic à l'étable.
- **Le coût est le coût restant probable**, pas une espérance : préparation
  des montures encore à obtenir, préparation des montures en place pas
  encore préparées (depuis leur niveau), un Filet de capture universel par
  capture, Optimakinas des croisements restants — au carburant le moins cher
  de chaque jauge. Cocher « Préparée » en retire la préparation. Il bouge à
  chaque résultat réel.

Ce qu'il sait des montures, et d'où :

- **Les variétés** sont les items des types « Dragodinde », « Muldo » et
  « Volkorne » (68, 120 et 120), la forme qu'ont prise les montures depuis la
  refonte 3.5 ; c'est eux qui portent l'icône et le prix HDV. Le dump
  `mounts.json` de dofusdude ne sert qu'à rattacher les certificats d'étable,
  il s'arrête à 71 muldos.
- **Générations et croisements** viennent de dofuspourlesnoobs.com
  (`npm run mounts` les relève dans `dofus_data/breeding.json`), recoupés
  sans écart avec dofuselevage.fr. Bien des muldos et volkornes ont **plusieurs
  recettes** (Muldo Roux : six couples) ; le plan en retient une par
  emplacement, au choix. La numérotation des volkornes n'est pas monotone —
  « Ivoire et Pourpre » est génération 4, « Ivoire » génération 5 — et le code
  ne suppose jamais qu'un parent est d'une génération inférieure.
- **La probabilité** est celle de la génération cible : 30 % + 0,15 % ×
  (niveau A + niveau B), +10 % avec une Optimakina, plafonnée à 100 %,
  donnée accouplement par accouplement sur les niveaux réels des parents. La
  répartition entre variétés de cette génération n'est pas publique : quand
  les arbres réels rendent plusieurs variétés possibles, la page les liste et
  dit « probabilité exacte inconnue », sans inventer de poids.
- **Le journal** garde l'historique : chaque accouplement (parents, bébé,
  variété visée) et chaque clonage, dans une section repliée à part, du plus
  récent au plus ancien. Une entrée s'efface sans toucher à l'étable.
- **Plans, étable et journal** vivent dans `localStorage`, comme les favoris : un
  élevage dure des jours, la page retrouve où on en était, mais pas d'un
  navigateur à l'autre.

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
Celui du 2026-09-09 crée la table des visiteurs ; sans lui, la stat manque
simplement au pied de page.

Un projet gratuit est mis en pause après 7 jours sans requête :
`.github/workflows/supabase-keepalive.yml` le réveille chaque semaine. Il
attend les secrets de dépôt `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`.

## Commandes

Tout se lance depuis `frontend/` :

```bash
cd frontend
npm install
npm run data      # régénère public/data/ depuis ../dofus_data/ (après une MAJ Dofus)
npm run mounts    # re-télécharge mounts.json et relève les croisements (puis npm run data)
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
- **La fréquentation compte des navigateurs, pas des personnes.** « En ligne »
  est l'état de présence du canal Realtime, « visiteurs » le nombre
  d'identifiants aléatoires posés une fois par navigateur. Navigation privée,
  stockage effacé ou second appareil comptent chacun pour un, et se déclarer
  est ouvert comme la saisie des prix. La table, elle, n'est ni lisible ni
  modifiable directement : seule une fonction SQL y écrit, et elle ne rend
  qu'un nombre. Aucune donnée personnelle : un UUID et une date.
- **Le SDK pèse ~59 Ko gzippés.** Il n'entre dans le bundle que si les
  variables d'environnement sont renseignées : sans elles, Vite les remplace par
  `undefined` et le client Supabase est éliminé au tree-shaking.
- **Pas d'information de métier** sur les recettes : elle est absente du dump.
- 11 recettes sont ignorées au build, leur résultat n'existant plus dans le
  catalogue (`npm run data` les liste).
- **Les croisements sont un relevé communautaire**, pas une donnée du jeu :
  `npm run data` signale toute variété sans génération ou parent inconnu, à
  corriger dans `dofus_data/breeding.json`. Deux dragodindes (à Plumes, en
  armure) n'ont pas de recette et ne se planifient pas.
- **Le sexe d'un bébé est aléatoire** et n'entre pas dans les probabilités du
  plan : un croisement peut donner la bonne variété du mauvais sexe — le plan
  le constate au résultat et cherche alors le sexe qui manque.
- **Pas de probabilité globale** sur tout l'arbre décisionnel : seules les
  chances par accouplement sont données. Le coût est celui du plan tel qu'il
  est, sans espérance de tentatives.
- **Deux plans peuvent réclamer la même monture** : chacun se calcule seul sur
  l'étable. À mener un plan à la fois par espèce.
