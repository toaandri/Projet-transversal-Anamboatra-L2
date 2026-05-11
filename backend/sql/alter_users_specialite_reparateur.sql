-- Ajouter REPARATEUR à l’énuméré PostgreSQL de users.specialite.
-- Nom du type : en général enum_users_specialite — vérifier si erreur avec :
--   SELECT udt_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'specialite';

ALTER TYPE enum_users_specialite ADD VALUE IF NOT EXISTS 'REPARATEUR';
