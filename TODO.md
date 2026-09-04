# À faire

Idées en attente, dans l'ordre où elles sont venues. Rien n'est engagé : on
avance étape par étape, et chaque étape se vit dans l'app avant la suivante.

## Vues : des listes d'items sur mesure, au format tableau de bord

Un nouveau type de dashboard. Une **vue** est une liste d'items choisie par
l'utilisateur, affichée avec le tableau, les filtres et le tri des dashboards
métier — des favoris, mais en plus développé.

- Créer une vue **depuis n'importe où** : à partir des filtres courants d'un
  dashboard ou de la recherche (« enregistrer cette sélection »), ou en
  ajoutant à une vue existante.
- Dans une vue, **ajouter des items à la main**, un par un.
- Les filtres sont **dynamiques** selon ce que la vue contient : types et
  catégories présents, craftables ou non, niveau, prix, coût… à détailler.
- Le remplissage assisté et Alt+clic marchent tels quels (portée = la vue).

À trancher : où vivent les vues. En localStorage elles ne suivent pas
l'utilisateur d'un navigateur à l'autre ; ça plaide pour **attendre les
comptes utilisateur et une table `users`** côté Supabase — auquel cas les
favoris deviendraient simplement « la première vue ».

## Crafts en cascade

Aujourd'hui le coût de craft additionne les ingrédients **au prix HDV**. Or un
ingrédient est parfois lui-même craftable moins cher que son prix : crafter A
avec B1 et B2, où B2 se crafte avec C1 et C2…

- Pour chaque ingrédient, retenir **le moins cher entre l'acheter et le
  crafter** (récursivement), comme on le fait déjà pour l'item final.
- Sortir le **plan optimal** : « acheter C1 et B1, crafter C2, B2, puis A », avec
  le coût total et le gain par rapport au tout-HDV.
- Attention aux **boucles** (une recette qui remonte à elle-même) et à la
  **profondeur** : borner la récursion, mémoïser — l'évaluateur chiffre déjà
  17 000 items en quelques millisecondes, il faut que ça reste vrai.
- Un coût partiel à un niveau (prix manquant) ne doit pas se propager en
  silence : même règle qu'aujourd'hui, un chiffrage incomplet ne décide rien.

L'endroit naturel : `domain/craft.ts` (`createEvaluator`), qui alimente déjà
tous les tableaux — les dashboards en profiteraient sans changer.

## Brisage de runes (reporté)

Discuté, pas engagé. Les conclusions — formule, coefficient à relever en
communauté par serveur, table des poids à calibrer en jeu — sont notées et
resserviront le jour venu.
