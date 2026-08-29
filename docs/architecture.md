# Kamadvice — Architecture (v1)

Ce document répond aux 5 questions posées avant d'écrire du code :
1. Architecture globale
2. Structure du repository
3. Entités métier principales
4. Workflow exact du premier MVP
5. Décisions techniques à prendre avant d'écrire du code

Il sera mis à jour au fil des étapes (modèle de données → backend minimal →
scanner minimal → communication → workflow complet → frontend).

## 1. Architecture globale

```
┌────────────┐      prix demandés       ┌──────────────┐
│  Scanner   │ <----------------------- │              │
│  (Python)  │                          │   Backend    │
│  - lit HDV │ -----------------------> │ (Spring Boot)│
│  - envoie  │      observations        │              │
│  les prix  │                          │  PostgreSQL  │
└────────────┘                          └──────┬───────┘
                                                │ REST (JSON)
                                         ┌──────▼───────┐
                                         │   Frontend   │
                                         │ (React/TS)   │
                                         └──────────────┘
```

Principes :
- Le **backend** est le cœur du système : il possède les règles métier
  (coût de craft, marge, rentabilité) et la persistance. Il ne sait pas
  *comment* un prix est obtenu, seulement qu'il en a besoin.
- Le **scanner** est un adaptateur de collecte, remplaçable (script
  d'automatisation aujourd'hui, appel à une API officielle demain) sans
  toucher au backend. Il communique avec le backend via une API REST
  simple (pull d'un "ticket" de scan à faire, push des observations).
- Le **frontend** est un client de consultation/analyse, il ne fait
  aucun calcul métier — tout est déjà calculé côté backend.
- Pas de message broker pour l'instant : le volume est faible (usage
  personnel, quelques centaines de requêtes), donc une API REST
  synchrone suffit. On introduira une file d'attente uniquement si un
  vrai besoin de découplage/scalabilité apparaît.

## 2. Structure du repository (monorepo)

```
/backend    Java 21 / Spring Boot — API REST, JPA, migrations Flyway
/scanner    Python — automatisation HDV, envoie les prix au backend
/frontend   React / TypeScript — consultation (ajouté après le premier
            workflow complet, pas dans ce lot)
/docs       documentation d'architecture et de décisions
docker-compose.yml   PostgreSQL (et plus tard le backend) en local
```

Chaque dossier est un projet indépendant avec son propre outillage
(Maven pour le backend, pip/venv pour le scanner, npm pour le
frontend). Pas de build système unique multi-langage : ça ajouterait
de la complexité sans bénéfice réel pour un projet personnel.

## 3. Entités métier principales

Distinction clé : **données statiques du jeu** vs **données dynamiques
d'observation de marché**.

### Données statiques (référentiel du jeu)

| Entité | Rôle |
|---|---|
| `Profession` | Un métier (Cordonnier, Bijoutier, ...) |
| `Resource` | Une ressource brute (peau, minerai, ...) |
| `Item` | Un objet fabriqué / équipement |
| `Recipe` | La recette permettant de fabriquer un `Item` : métier requis, niveau requis, objet produit |
| `RecipeIngredient` | Ligne d'une recette : une ressource ou un objet, en quantité N |
| `GameServer` | Un serveur Dofus (les prix HDV sont propres à un serveur) |

Remarque : une `RecipeIngredient` peut référencer soit une `Resource`
soit un `Item` (les recettes peuvent utiliser des objets fabriqués
comme ingrédients). Modélisé via une entité `Ingredient`/interface
commune plutôt que deux clés étrangères optionnelles — décision à
affiner lors du modèle de données détaillé.

### Données dynamiques (observations de marché)

| Entité | Rôle |
|---|---|
| `PriceObservation` | Un prix observé : `item_or_resource_id`, `server_id`, `quantity_lot` (x1/x10/x100), `price`, `observed_at`, `source` (ex: `SCANNER_MANUAL`, `API`) |
| `ScanSession` | Une session de scan : date de début/fin, serveur ciblé, liste des cibles demandées, statut |
| `ScanRequestItem` | Une cible demandée dans une session (quel item/ressource scanner) et son statut (`PENDING`, `FOUND`, `NOT_FOUND`) |

L'historique est conservé : on **ajoute** des `PriceObservation`, on ne
met jamais à jour un prix existant. Le "dernier prix connu" est une
simple requête (`ORDER BY observed_at DESC LIMIT 1`), pas un champ
dénormalisé pour l'instant.

### Entités de calcul (dérivées, pas forcément persistées au début)

- Coût d'un craft = somme(quantité × dernier prix connu) pour chaque
  ingrédient.
- Marge = prix de vente de l'objet − coût du craft.
- Rentabilité = classement par marge (ou marge/temps, plus tard).

Pour le MVP, ces calculs seront faits à la volée dans un service, sans
table dédiée — on évite de persister une donnée dérivée tant qu'on n'a
pas de besoin de requêtage/historisation dessus.

## 4. Workflow exact du MVP

Cas d'usage : "Analyser les crafts de Cordonnier entre les niveaux 65
et 70."

1. Le backend expose `GET /api/professions/{id}/recipes?minLevel=65&maxLevel=70`
   → lit les `Recipe` statiques (déjà en base via Flyway/seed, pas de
   scraping ici : ces données sont stables et petites, importées une
   fois).
2. Le backend calcule l'ensemble **dédupliqué** des ressources/items
   nécessaires à ces recettes.
3. Le backend crée une `ScanSession` avec un `ScanRequestItem` par
   ressource/item unique, statut `PENDING`.
4. Le scanner Python interroge périodiquement (ou sur commande)
   `GET /api/scan-sessions/{id}/pending` pour récupérer sa liste de
   cibles.
5. Le scanner scanne les prix dans le jeu et envoie
   `POST /api/scan-sessions/{id}/observations` avec les prix trouvés
   (par lot x1/x10/x100 si disponibles).
6. Le backend enregistre chaque prix comme un nouveau
   `PriceObservation` horodaté, et marque le `ScanRequestItem`
   correspondant comme `FOUND` (ou `NOT_FOUND` après erreur/timeout).
7. Une fois la session complète (ou sur demande manuelle), le backend
   calcule pour chaque recette : coût total, prix de vente de l'objet
   (dernière observation connue), marge, classement.
8. `GET /api/professions/{id}/recipes/ranking?minLevel=65&maxLevel=70`
   retourne le classement — consommé pour l'instant via un simple
   appel HTTP (curl/Postman), le frontend n'étant pas encore construit
   dans ce lot.

Réutilisation : une nouvelle analyse (autre métier, autre tranche de
niveau) recherche d'abord les `PriceObservation` existantes suffisamment
récentes avant de créer de nouvelles `ScanRequestItem` — évite de
rescanner ce qui est déjà connu. Le seuil de fraîcheur ("suffisamment
récent") est une décision à prendre plus tard (voir §5).

## 5. Décisions techniques prises pour ce lot

- **Java 21**, Spring Boot 3.x, Maven (build simple, un seul module —
  pas besoin de multi-module tant qu'il n'y a qu'une seule application
  backend).
- **Flyway** pour les migrations (plus simple que Liquibase pour un
  projet solo, SQL brut lisible).
- **PostgreSQL** via Docker Compose en local, pas de H2 en dev pour
  éviter les écarts de comportement avec la prod locale.
- Le lien entre `RecipeIngredient` et sa cible (Resource ou Item) est
  modélisé simplement pour l'instant : une seule table `recipe_ingredient`
  avec deux colonnes nullable `resource_id` / `item_id` et une
  contrainte CHECK garantissant qu'une seule des deux est renseignée.
  Alternative envisagée (table `tradable_good` commune à `Item` et
  `Resource`) : reportée pour éviter une abstraction prématurée tant
  qu'on n'a pas de second cas d'usage la justifiant.
- Pas encore de contrat d'API scanner↔backend figé au-delà de ce qui
  est nécessaire au MVP (`GET pending` / `POST observations`) : à
  affiner une fois le scanner minimal codé.
- Pas d'authentification, pas de multi-utilisateur : usage personnel
  local uniquement pour ce lot.

## Décisions restant à prendre (prochaines étapes)

- Format exact du payload de scan (unité de lot, gestion des erreurs
  de scan côté scanner).
- Politique de "fraîcheur" d'un prix pour décider de rescanner ou non.
- Schéma de la table `recipe_ingredient` définitif une fois les
  premières recettes réelles importées (voir si le modèle nullable
  suffit ou s'il faut la table `tradable_good`).
