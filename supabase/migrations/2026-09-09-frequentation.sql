-- Fréquentation : le compte des navigateurs distincts passés sur l'app.
--
-- À exécuter une fois dans le SQL Editor. Rejouable : chaque ordre vérifie
-- l'état avant d'agir, et un projet qui a passé la première version de ce
-- script (insertion directe + `visitor_count`) est ramené à celle-ci.
-- Tant que ce n'est pas fait, le front s'en passe : la stat « visiteurs »
-- reste simplement absente du pied de page. Le compte « en ligne », lui,
-- passe par la Presence du canal Realtime et ne demande rien en base.
--
-- Un identifiant aléatoire par navigateur, posé une fois. Pas de dernière
-- visite ni de compteur : ce serait autoriser la mise à jour à tout le monde,
-- pour une stat qu'on ne montre pas.
create table if not exists public.visitors (
  id         uuid        primary key,
  first_seen timestamptz not null default now()
);

-- Aucune politique : la table n'est ni lisible ni modifiable directement.
-- Une politique d'ajout seul ne suffirait pas — `on conflict do nothing`
-- compare à la ligne existante, ce qui exige une politique de lecture, et
-- les identifiants n'ont rien à faire dans un navigateur tiers.
alter table public.visitors enable row level security;
drop policy if exists "ajout public" on public.visitors;

-- Se déclarer et compter, en un appel. La fonction s'exécute avec les droits
-- de son propriétaire, et ne rend qu'un nombre.
create or replace function public.visit(visitor uuid)
  returns bigint
  language sql
  volatile
  security definer
  set search_path = public
as $$
  insert into public.visitors (id) values (visitor) on conflict (id) do nothing;
  select count(*) from public.visitors;
$$;

revoke all on function public.visit(uuid) from public;
grant execute on function public.visit(uuid) to anon;

-- Remplacée par `visit`, qui compte après s'être déclaré.
drop function if exists public.visitor_count();
