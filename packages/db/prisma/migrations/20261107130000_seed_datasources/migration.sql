-- Seed registered datasources as financial_institutions.
-- Open Finance AISP + all finexpert.de/schnittstellen integrations.
-- Idempotent: skip adapters that already exist.

INSERT INTO "financial_institutions" ("id", "name", "bic", "adapter", "created_at")
SELECT gen_random_uuid(), v.name, NULL, v.adapter, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('finAPI (AISP)', 'FINAPI'),
    ('Tink (AISP)', 'TINK'),
    ('wealthAPI (Depot)', 'WEALTHAPI'),
    ('finexpert REST API', 'FINEXPERT_REST'),
    ('blau direkt', 'BLAU_DIREKT'),
    ('BCA AG', 'BCA'),
    ('Franke & Bornberg (fb>vertragscheck)', 'FRANKE_BORNBERG'),
    ('TAA-Schnittstelle', 'TAA'),
    ('MVP-Systeme', 'MVP')
) AS v(name, adapter)
WHERE NOT EXISTS (
  SELECT 1 FROM "financial_institutions" fi WHERE fi.adapter = v.adapter
);
