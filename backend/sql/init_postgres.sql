DROP TABLE IF EXISTS status_audits CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS suggestion_citoyens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

DROP TYPE IF EXISTS enum_users_role;
DROP TYPE IF EXISTS enum_users_specialite;
DROP TYPE IF EXISTS enum_zones_type;

CREATE TYPE enum_zones_type AS ENUM (
  'ARRONDISSEMENT',
  'ROUTE_NATIONALE',
  'DEPOT_REPARATION'
);

CREATE TYPE enum_users_role AS ENUM (
  'SUPER_ADMIN',
  'AGENT_PATROUILLE',
  'ADMIN_QG',
  'EQUIPE_INTERVENTION',
  'CITOYEN'
);

CREATE TYPE enum_users_specialite AS ENUM (
  'ROUTE',
  'JIRAMA',
  'MACON',
  'NETTOYEUR',
  'REPARATEUR'
);

CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(255) NOT NULL,
  type enum_zones_type NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  numero_qg VARCHAR(32) NULL,
  geometrie JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom VARCHAR(120) NOT NULL,
  prenom VARCHAR(120) NOT NULL,
  matricule VARCHAR(64) NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe_hash VARCHAR(255) NOT NULL,
  role enum_users_role NOT NULL,
  zone_id UUID NULL REFERENCES zones (id) ON DELETE SET NULL ON UPDATE CASCADE,
  numero_telephone VARCHAR(32) NULL,
  specialite enum_users_specialite NULL,
  appareil_unique VARCHAR(191) NULL UNIQUE,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  position_latitude DOUBLE PRECISION NULL,
  position_longitude DOUBLE PRECISION NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_users_telephone_required
    CHECK (
      role IN ('CITOYEN', 'SUPER_ADMIN')
      OR numero_telephone IS NOT NULL
    ),
  CONSTRAINT chk_users_specialite_for_team
    CHECK (
      role <> 'EQUIPE_INTERVENTION'
      OR specialite IS NOT NULL
    ),
  CONSTRAINT chk_users_specialite_scope
    CHECK (
      role = 'EQUIPE_INTERVENTION'
      OR specialite IS NULL
    )
);

CREATE INDEX idx_users_zone_id ON users (zone_id);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_actif ON users (actif);
CREATE INDEX idx_users_specialite ON users (specialite);

INSERT INTO users (
  nom, prenom, email, mot_de_passe_hash, role,
  zone_id, numero_telephone, specialite, actif
) VALUES (
  'Administrateur', 'Système',
  'admin@anamboatra.mg',
  '$2a$10$gOKTkgzTlxDUDkLduULsoe1krpJKAFvtyC2MyKWpJ.xhNh4hwKIuO',
  'SUPER_ADMIN',
  NULL, NULL, NULL, TRUE
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_tickets_type_infrastructure') THEN
    ALTER TYPE enum_tickets_type_infrastructure ADD VALUE IF NOT EXISTS 'ELECTRICITE_EAU';
    ALTER TYPE enum_tickets_type_infrastructure ADD VALUE IF NOT EXISTS 'PROPRIETE_PUBLIQUE';
    ALTER TYPE enum_tickets_type_infrastructure ADD VALUE IF NOT EXISTS 'SALUBRITE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_suggestion_citoyens_type_suggere') THEN
    ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE IF NOT EXISTS 'ELECTRICITE_EAU';
    ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE IF NOT EXISTS 'PROPRIETE_PUBLIQUE';
    ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE IF NOT EXISTS 'SALUBRITE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    UPDATE tickets
    SET type_infrastructure = 'ELECTRICITE_EAU'
    WHERE type_infrastructure IN ('ELECTRICITE', 'EAU');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'suggestion_citoyens') THEN
    UPDATE suggestion_citoyens
    SET type_suggere = 'ELECTRICITE_EAU'
    WHERE type_suggere IN ('ELECTRICITE', 'EAU');
  END IF;
END $$;
