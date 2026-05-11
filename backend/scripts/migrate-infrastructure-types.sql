-- Migration types d’infrastructure
-- Anciens : ROUTE, ELECTRICITE, EAU  →  ROUTE, ELECTRICITE_EAU, PROPRIETE_PUBLIQUE, SALUBRITE
--
-- Vérifier les noms d’ENUM :  \d tickets   et   \d suggestion_citoyens
-- (souvent enum_tickets_type_infrastructure et enum_suggestion_citoyens_type_suggere)
--
-- Si une ligne « already exists » : la commenter et ré-exécuter.

ALTER TYPE enum_tickets_type_infrastructure ADD VALUE 'ELECTRICITE_EAU';
ALTER TYPE enum_tickets_type_infrastructure ADD VALUE 'PROPRIETE_PUBLIQUE';
ALTER TYPE enum_tickets_type_infrastructure ADD VALUE 'SALUBRITE';

ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE 'ELECTRICITE_EAU';
ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE 'PROPRIETE_PUBLIQUE';
ALTER TYPE enum_suggestion_citoyens_type_suggere ADD VALUE 'SALUBRITE';

UPDATE tickets
SET type_infrastructure = 'ELECTRICITE_EAU'
WHERE type_infrastructure IN ('ELECTRICITE', 'EAU');

UPDATE suggestion_citoyens
SET type_suggere = 'ELECTRICITE_EAU'
WHERE type_suggere IN ('ELECTRICITE', 'EAU');
