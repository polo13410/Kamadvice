-- Prix HDV partagés.
--
-- À exécuter une fois dans le SQL Editor du projet Supabase. Le fichier est
-- versionné pour que le schéma en production soit lisible depuis le dépôt.
--
-- Le modèle reprend celui du client : un item n'a pas de « prix actuel », il a
-- un journal de relevés, et le prix courant est le plus récent. Une saisie
-- n'écrase donc jamais celle d'un autre contributeur — c'est ce qui permet de
-- se passer de backend et de verrouillage.

create table public.price_points (
  id      bigint generated always as identity primary key,
  -- Les prix varient d'un serveur Dofus à l'autre : chaque relevé porte le
  -- sien, par la clé de `frontend/src/data/servers.ts` ('imagiro', 'dakal'…).
  -- Pas de valeur par défaut : le client l'envoie toujours, et un défaut ne
  -- ferait que ranger un relevé mal formé sur le mauvais serveur.
  server  text        not null,
  item_id integer     not null,
  price   integer     not null check (price >= 0),
  at      timestamptz not null default now()
);

-- Porte la vue des prix courants ci-dessous.
create index price_points_lookup on public.price_points (server, item_id, at desc);

-- Deux relevés identiques au même instant ne disent rien de plus qu'un seul.
-- Rend la migration des prix locaux rejouable sans créer de doublons, via
-- l'en-tête `Prefer: resolution=ignore-duplicates`.
create unique index price_points_unique on public.price_points (server, item_id, at, price);

-- Le prix courant d'un item : son relevé le plus récent. Une ligne par item,
-- ce qui borne le chargement au démarrage au nombre d'items du catalogue,
-- quel que soit le volume d'historique accumulé.
create view public.current_prices
  with (security_invoker = on) as
select distinct on (server, item_id) id, server, item_id, price, at
from public.price_points
order by server, item_id, at desc;

-- La clé publiable vit dans le bundle : elle est publique par construction.
-- C'est la RLS qui décide de ce qui est permis, pas le secret de la clé. Sans
-- session Supabase Auth — il n'y en a aucune ici — elle résout vers le rôle
-- `anon`, celui que ciblent les politiques ci-dessous.
alter table public.price_points enable row level security;

create policy "lecture publique" on public.price_points
  for select to anon using (true);

create policy "ajout public" on public.price_points
  for insert to anon with check (true);

-- Contribution ouverte assumée : supprimer un relevé erroné depuis
-- l'historique d'un item doit rester à la portée de tout le monde.
create policy "suppression publique" on public.price_points
  for delete to anon using (true);

grant select on public.current_prices to anon;

-- Diffusion en direct des relevés.
--
-- Par défaut, un événement de suppression ne transporte que la clé primaire :
-- impossible alors de savoir quel item est concerné. `replica identity full`
-- fait voyager la ligne entière, ce qui permet aussi de filtrer les
-- suppressions par serveur de jeu comme les insertions. Le surcoût de WAL est
-- sans commune mesure avec le volume ici — quelques dizaines d'octets par
-- relevé supprimé.
alter table public.price_points replica identity full;

-- Rejouer cette ligne sur une table déjà publiée lève une erreur : c'est sans
-- conséquence, le reste du script ayant déjà été appliqué.
alter publication supabase_realtime add table public.price_points;

-- Fréquentation : le compte des navigateurs distincts passés sur l'app.
--
-- Un identifiant aléatoire par navigateur, posé une fois. Pas de dernière
-- visite ni de compteur : ce serait autoriser la mise à jour à tout le monde,
-- pour une stat qu'on ne montre pas. Le compte « en ligne », lui, passe par
-- la Presence du canal Realtime et ne demande rien en base.
create table public.visitors (
  id         uuid        primary key,
  first_seen timestamptz not null default now()
);

alter table public.visitors enable row level security;

-- Ajout seul, en doublon ignoré côté client (`resolution=ignore-duplicates`).
create policy "ajout public" on public.visitors
  for insert to anon with check (true);

-- Pas de lecture publique : les identifiants n'ont rien à faire dans un
-- navigateur tiers. Le compte passe par une fonction qui s'exécute avec les
-- droits de son propriétaire, et ne rend qu'un nombre.
create function public.visitor_count()
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select count(*) from public.visitors
$$;

grant execute on function public.visitor_count() to anon;
