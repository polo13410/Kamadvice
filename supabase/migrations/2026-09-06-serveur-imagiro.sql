-- Multi-serveur : les relevés collectés jusqu'ici l'ont été sur Imagiro, sous
-- la valeur provisoire 'main'. Le client les cherche désormais sous la clé du
-- serveur (voir `frontend/src/data/servers.ts`).
--
-- À exécuter une fois dans le SQL Editor, AVANT de déployer le front qui porte
-- le choix du serveur : sans ça, Imagiro repart de zéro et les nouveaux relevés
-- s'empilent à côté des anciens. Rejouable : un second passage ne touche rien.
update public.price_points set server = 'imagiro' where server = 'main';

-- Le client envoie toujours le serveur : une valeur par défaut ne ferait que
-- masquer un relevé mal formé en le rangeant sur le mauvais serveur.
alter table public.price_points alter column server drop default;
