# Projet-transversal-Anamboatra-L2

Projet de fin d’année L2 — **Anamboatra** (SGRI-2035). **Livre / cahier des normes :** [`CahierDesNormes-Maharavo.docx`](CahierDesNormes-Maharavo.docx). **Cahier des charges :** [`Anamboatra_Cahier_des_Charges_v3.docx`](Anamboatra_Cahier_des_Charges_v3.docx). Modèle ESIE : [`CahierDesNormes-ProjetTransversal-L2SIO.docx`](CahierDesNormes-ProjetTransversal-L2SIO.docx).

## Dépôt (monorepo)

| Dossier | Rôle |
|---------|------|
| **`backend/`** | API Node.js (Express), JWT, Socket.io, PostgreSQL, Multer |
| **`frontend/`** | Site citoyen + poste QG (React / Vite) + build Electron |
| **`mobile/`** | Application terrain (Expo / expo-router) |
| **`docs/`** | [Normes Maharavo](docs/CahierDesNormes-Maharavo.md) · [CDC](docs/Cahier_des_charges_Anamboatra_v3.0_FINAL.md) · [UML](docs/anamboatra.puml) |

**Régénérer la documentation (modèle L2 SIO obligatoire) :**

```bash
python scripts/build_docs_additive.py    # enrichit les .md sans supprimer votre texte
python scripts/generate_docx_proper.py # produit CahierDesNormes-Maharavo.docx + Anamboatra_Cahier_des_Charges_v3.docx
```

Sources éditables : [`docs/CahierDesNormes-Maharavo.md`](docs/CahierDesNormes-Maharavo.md) · [`docs/Cahier_des_charges_Anamboatra_v3.0_FINAL.md`](docs/Cahier_des_charges_Anamboatra_v3.0_FINAL.md)

**Présentation soutenance (PowerPoint) :**

```bash
python scripts/generate_presentation.py
```

Fichier produit : [`docs/Anamboatra_Presentation_Soutenance.pptx`](docs/Anamboatra_Presentation_Soutenance.pptx) — Introduction, Contexte, Solution, Technologies, Diagrammes, Démonstration.

### Structure des sources

```
backend/src/
  config/       # env, postgres
  constants/    # enums métier
  middleware/   # auth, rôles, admin
  models/postgres/
  routes/       # *.routes.js
  services/     # logique métier partagée
  utils/
  scripts/      # seed.js

backend/sql/init_postgres.sql

frontend/src/
  auth/         # AuthProvider, auth-context, useAuth
  hooks/
  lib/          # api, types
  theme/        # charte graphique, carte
  pages/
  components/
  App.tsx       # site citoyen
  StaffApp.tsx  # poste QG

mobile/
  app/          # écrans (expo-router)
  src/
    auth/
    lib/
    theme/
    components/
```

Les imports transverses utilisent l’alias **`@/`** → `src/` (frontend et mobile).

Modélisation UML (vue institutionnelle MTP / postes communaux / terrain) : [`docs/anamboatra.puml`](docs/anamboatra.puml) — [PlantUML](https://plantuml.com/fr/).

### Démarrer le back-end

1. `cd backend` puis copier `.env.example` vers `.env`.
2. PostgreSQL : `docker compose up -d` dans `backend/` (port hôte **5433**) **ou** exécuter `backend/sql/init_postgres.sql` dans pgAdmin.
3. `npm install` puis `npm run seed` — mot de passe démo `demo123456`.
4. `npm run dev` — API sur le port **4000** (défaut).

### Démarrer le frontend

```bash
cd frontend && npm install
npm run dev          # site citoyen → http://localhost:5173
npm run dev:staff    # poste QG → http://localhost:5173/staff.html#/
npm run build:staff  # sortie dist-staff/ (non versionnée)
```

### Démarrer le mobile

```bash
cd mobile && npm install
npm start            # Expo (LAN)
```

Configurer `API_URL` dans `mobile/app.json` → `extra`.
