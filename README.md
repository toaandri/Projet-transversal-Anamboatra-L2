# Projet-transversal-Anamboatra-L2

Projet de fin d’année L2 — **Anamboatra** (SGRI-2035), d’après le cahier des charges v2.1.

## Dépôt (dossiers séparés)

- **`backend/`** — API Node.js (Express), JWT, Socket.io, **PostgreSQL seul** (zones, utilisateurs, tickets, suggestions, audit), Multer (photos).
- **`frontend/`** — Interface web (React) — à venir.
- **`mobile/`** — Application Expo — à venir.

### Démarrer le back-end

1. `cd backend` puis copier `.env.example` vers `.env`.
2. PostgreSQL : créer une base vide, puis exécuter **`backend/sql/init_postgres.sql`** dans pgAdmin (ou `psql`) **ou** lancer **`docker compose up -d`** dans `backend/` (uniquement Postgres, port hôte **5433**), puis `npm run seed` pour les zones / comptes démo.
3. `npm install` puis `npm run seed` si besoin — mot de passe démo `demo123456`. Les tables **tickets**, **suggestions** et **audits** sont créées par Sequelize au premier `npm run dev`.
4. `npm run dev` — API sur le port défini dans `.env` (défaut **4000**). Si tu vois une erreur d’**authentification PostgreSQL** (`28P01`), aligne `POSTGRES_*` (ou `DATABASE_URL`) sur ton instance : voir commentaires dans `backend/.env.example`.
