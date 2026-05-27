-- Re-seed region Antananarivo (homogene, large couverture).
-- Supprime les anciennes donnees [MASSIF-TANA], puis reinjecte.

BEGIN;

DO $$
DECLARE
  arr_count INTEGER;
  reporter_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO arr_count FROM zones WHERE type = 'ARRONDISSEMENT';
  IF arr_count = 0 THEN
    RAISE EXCEPTION 'Aucune zone ARRONDISSEMENT disponible.';
  END IF;

  SELECT COUNT(*) INTO reporter_count
  FROM users
  WHERE actif = TRUE AND role IN ('AGENT_PATROUILLE', 'ADMIN_QG', 'SUPER_ADMIN');
  IF reporter_count = 0 THEN
    RAISE EXCEPTION 'Aucun user actif (AGENT_PATROUILLE/ADMIN_QG/SUPER_ADMIN).';
  END IF;
END $$;

WITH old_massif_tickets AS (
  SELECT id FROM tickets WHERE description LIKE '[MASSIF-TANA]%'
),
_del_audits AS (
  DELETE FROM status_audits WHERE ticket_id IN (SELECT id FROM old_massif_tickets) RETURNING id
),
_del_tickets AS (
  DELETE FROM tickets WHERE id IN (SELECT id FROM old_massif_tickets) RETURNING id
),
_del_suggestions AS (
  DELETE FROM suggestion_citoyens WHERE description LIKE '[MASSIF-TANA]%' RETURNING id
),
reporter_pool AS (
  SELECT id FROM users WHERE actif = TRUE AND role IN ('AGENT_PATROUILLE', 'ADMIN_QG', 'SUPER_ADMIN')
),
patrol_pool AS (
  SELECT id FROM users WHERE role = 'AGENT_PATROUILLE'::enum_users_role AND actif = TRUE
),
closer_pool AS (
  SELECT id FROM users WHERE role IN ('AGENT_PATROUILLE'::enum_users_role, 'ADMIN_QG'::enum_users_role) AND actif = TRUE
),
arr AS (
  SELECT id FROM zones WHERE type = 'ARRONDISSEMENT'
),
base_points AS (
  SELECT row_number() OVER () AS idx, q_name, q_lat, q_lng
  FROM (VALUES
    ('Analakely', -18.9084::double precision, 47.5252::double precision),
    ('Anosy', -18.9171::double precision, 47.5336::double precision),
    ('Ankorondrano', -18.8795::double precision, 47.5231::double precision),
    ('Ivandry', -18.8752::double precision, 47.5348::double precision),
    ('67Ha', -18.9188::double precision, 47.5174::double precision),
    ('Andavamamba', -18.9303::double precision, 47.5235::double precision),
    ('Ambohijatovo', -18.9139::double precision, 47.5291::double precision),
    ('Tsaralalana', -18.9099::double precision, 47.5184::double precision),
    ('Mahamasina', -18.9234::double precision, 47.5298::double precision),
    ('Anosizato', -18.9545::double precision, 47.4882::double precision),
    ('Andoharanofotsy', -18.9512::double precision, 47.5076::double precision),
    ('Tanjombato', -18.9374::double precision, 47.5178::double precision),
    ('Itaosy', -18.9121::double precision, 47.4334::double precision),
    ('Fenoarivo', -18.9288::double precision, 47.4591::double precision),
    ('Ampitatafika', -18.9213::double precision, 47.3998::double precision),
    ('Sabotsy Namehana', -18.8313::double precision, 47.5613::double precision),
    ('Ambohimangakely', -18.8765::double precision, 47.5899::double precision),
    ('Alasora', -18.9102::double precision, 47.5724::double precision),
    ('Ankadikely Ilafy', -18.8582::double precision, 47.5861::double precision),
    ('Ambohimalaza', -18.8928::double precision, 47.6077::double precision),
    ('Ivato', -18.8137::double precision, 47.4771::double precision),
    ('Talatamaty', -18.8414::double precision, 47.4794::double precision),
    ('Ambohidratrimo Centre', -18.8076::double precision, 47.4327::double precision),
    ('Mahitsy', -18.7358::double precision, 47.3417::double precision),
    ('Anosiala', -18.7713::double precision, 47.4542::double precision),
    ('Soavina', -18.9591::double precision, 47.4127::double precision),
    ('Ambatofahavalo', -18.9467::double precision, 47.5481::double precision),
    ('Masindray', -18.9854::double precision, 47.4558::double precision),
    ('Imerinkasinina', -18.8724::double precision, 47.6315::double precision),
    ('Anjeva Gara', -18.9231::double precision, 47.6267::double precision)
  ) AS t(q_name, q_lat, q_lng)
),
ticket_rows AS (
  SELECT
    gs,
    (SELECT id FROM arr ORDER BY random() LIMIT 1) AS zone_id,
    (SELECT id FROM reporter_pool ORDER BY random() LIMIT 1) AS user_id,
    bp.q_name,
    bp.q_lat + ((random() - 0.5) * 0.028) AS lat,
    bp.q_lng + ((random() - 0.5) * 0.036) AS lng,
    CASE (gs % 4) WHEN 0 THEN 'ROUTE' WHEN 1 THEN 'ELECTRICITE_EAU' WHEN 2 THEN 'PROPRIETE_PUBLIQUE' ELSE 'SALUBRITE' END::enum_tickets_type_infrastructure AS type_infra,
    CASE WHEN (gs % 5) IN (0, 1) THEN 'URGENT' ELSE 'NORMAL' END::enum_tickets_urgence AS urgence,
    CASE WHEN (gs % 10) = 0 THEN 'CLOTURE' WHEN (gs % 10) IN (1,2) THEN 'TERMINE' WHEN (gs % 10) IN (3,4) THEN 'EN_REPARATION' WHEN (gs % 10) IN (5,6) THEN 'REPARATION_PREVUE' ELSE 'EN_ATTENTE_CONFIRMATION' END::enum_tickets_statut AS statut
  FROM generate_series(1, 2200) AS gs
  JOIN base_points bp ON bp.idx = ((gs - 1) % (SELECT COUNT(*) FROM base_points)) + 1
),
suggestion_rows AS (
  SELECT
    gs,
    (SELECT id FROM arr ORDER BY random() LIMIT 1) AS zone_id,
    bp.q_name,
    bp.q_lat + ((random() - 0.5) * 0.020) AS lat,
    bp.q_lng + ((random() - 0.5) * 0.026) AS lng,
    CASE (gs % 4) WHEN 0 THEN 'ROUTE' WHEN 1 THEN 'ELECTRICITE_EAU' WHEN 2 THEN 'PROPRIETE_PUBLIQUE' ELSE 'SALUBRITE' END::enum_suggestion_citoyens_type_suggere AS type_suggere
  FROM generate_series(1, 900) AS gs
  JOIN base_points bp ON bp.idx = ((gs - 1) % (SELECT COUNT(*) FROM base_points)) + 1
)
INSERT INTO tickets (
  id, description, photo_signalement, urgence, statut, type_infrastructure, zone_id, localisation,
  signalant_user_id, visible_public, date_signalement, date_confirmation, mission, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '[MASSIF-TANA] ' || tr.q_name || ' - anomalie fictive regionale',
  CASE (tr.gs % 6)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1200&q=70'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1465447142348-e9952c393450?auto=format&fit=crop&w=1200&q=70'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=70'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1200&q=70'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1508057198894-247b23fe5ade?auto=format&fit=crop&w=1200&q=70'
    ELSE 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=70'
  END,
  tr.urgence,
  tr.statut,
  tr.type_infra,
  tr.zone_id,
  jsonb_build_object('latitude', tr.lat, 'longitude', tr.lng),
  tr.user_id,
  (tr.statut <> 'EN_ATTENTE_CONFIRMATION'::enum_tickets_statut),
  NOW() - ((tr.gs + 3) * INTERVAL '2 hours'),
  CASE WHEN tr.statut = 'EN_ATTENTE_CONFIRMATION'::enum_tickets_statut THEN NULL ELSE NOW() - ((tr.gs + 2) * INTERVAL '2 hours') END,
  CASE
    WHEN tr.statut IN ('TERMINE'::enum_tickets_statut, 'CLOTURE'::enum_tickets_statut)
    THEN jsonb_build_object(
      'note', 'Intervention terminee (donnee fictive)',
      'photoCloture',
      CASE (tr.gs % 3)
        WHEN 0 THEN 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=1200&q=70'
        WHEN 1 THEN 'https://images.unsplash.com/photo-1468436139062-f60a71c5c892?auto=format&fit=crop&w=1200&q=70'
        ELSE 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=70'
      END
    )
    ELSE NULL
  END,
  NOW() - ((tr.gs + 1) * INTERVAL '2 hours'),
  NOW() - (tr.gs * INTERVAL '45 minutes')
FROM ticket_rows tr;

INSERT INTO suggestion_citoyens (
  id, description, type_suggere, date_soumission, pseudo_citoyen, traitee, zone_id, localisation,
  photo_citoyen, assigned_patrol_user_id, instruction_qg, dispatched_at, terrain_cloture_code,
  terrain_cloture_comment, terrain_cloture_par_user_id, terrain_cloture_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '[MASSIF-TANA] ' || sr.q_name || ' - suggestion citoyenne fictive',
  sr.type_suggere,
  NOW() - ((sr.gs + 6) * INTERVAL '3 hours'),
  'Mponina-' || LPAD(sr.gs::TEXT, 4, '0'),
  (sr.gs % 10) IN (7, 8, 9),
  sr.zone_id,
  jsonb_build_object('latitude', sr.lat, 'longitude', sr.lng),
  CASE (sr.gs % 5)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1470004914212-05527e49370b?auto=format&fit=crop&w=1200&q=70'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1494418680614-9d49b95a62e6?auto=format&fit=crop&w=1200&q=70'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1507992781348-310259076fe0?auto=format&fit=crop&w=1200&q=70'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1524230572899-a752b3835840?auto=format&fit=crop&w=1200&q=70'
    ELSE 'https://images.unsplash.com/photo-1529429611278-74f5f6e8d3c1?auto=format&fit=crop&w=1200&q=70'
  END,
  CASE WHEN (sr.gs % 10) IN (4, 5, 6, 7, 8, 9) THEN (SELECT id FROM patrol_pool ORDER BY random() LIMIT 1) ELSE NULL END,
  CASE WHEN (sr.gs % 10) IN (4, 5, 6) THEN 'Controle terrain en cours' WHEN (sr.gs % 10) IN (7, 8, 9) THEN 'Traitement finalise' ELSE NULL END,
  CASE WHEN (sr.gs % 10) IN (4, 5, 6, 7, 8, 9) THEN NOW() - ((sr.gs + 4) * INTERVAL '2 hours') ELSE NULL END,
  CASE WHEN (sr.gs % 10) = 7 THEN 'OFFICIAL_TICKET' WHEN (sr.gs % 10) = 8 THEN 'NON_CONFORME' WHEN (sr.gs % 10) = 9 THEN 'AUTRE' ELSE NULL END,
  CASE WHEN (sr.gs % 10) = 7 THEN 'Convertie en ticket officiel (fictif)' WHEN (sr.gs % 10) = 8 THEN 'Signalement non conforme' WHEN (sr.gs % 10) = 9 THEN 'Cloture autre motif' ELSE NULL END,
  CASE WHEN (sr.gs % 10) IN (7, 8, 9) THEN (SELECT id FROM closer_pool ORDER BY random() LIMIT 1) ELSE NULL END,
  CASE WHEN (sr.gs % 10) IN (7, 8, 9) THEN NOW() - ((sr.gs + 2) * INTERVAL '90 minutes') ELSE NULL END,
  NOW() - ((sr.gs + 3) * INTERVAL '2 hours'),
  NOW() - (sr.gs * INTERVAL '15 minutes')
FROM suggestion_rows sr;

COMMIT;
