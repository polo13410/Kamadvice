-- Fréquentation : le compte des navigateurs distincts passés sur l'app.
--
-- À exécuter une fois dans le SQL Editor. Tant que ce n'est pas fait, le
-- front s'en passe : la stat « visiteurs » reste simplement absente du pied
-- de page. Le compte « en ligne », lui, passe par la Presence du canal
-- Realtime et ne demande rien en base.
--
-- Un identifiant aléatoire par navigateur, posé une fois. Pas de dernière
-- visite ni de compteur : ce serait autoriser la mise à jour à tout le monde,
-- pour une stat qu'on ne montre pas.
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
