# Kamadvice

Outil personnel d'analyse de l'économie de Dofus : collecte des prix
en hôtel de vente (HDV), calcul du coût des recettes de craft, et
classement par rentabilité.

Voir [`docs/architecture.md`](docs/architecture.md) pour l'architecture
globale, le modèle de données et le workflow du MVP.

## Structure du repository

```
/backend    Java 21 / Spring Boot — API REST, JPA, migrations Flyway
/scanner    Python — collecte des prix dans l'HDV (adaptateur, remplaçable)
/frontend   React / TypeScript — consultation (à venir)
/docs       documentation d'architecture
```

## Démarrage local

```bash
docker compose up -d          # PostgreSQL
cd backend && mvn spring-boot:run
```

Les identifiants PostgreSQL par défaut (`kamadvice` / `kamadvice`,
usage local uniquement) peuvent être surchargés en définissant
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` dans un fichier
`.env` (non versionné) à la racine du projet.