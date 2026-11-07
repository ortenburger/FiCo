-- Seed finanzmining / cashbuzz analytics datasource

INSERT INTO "financial_institutions" ("id", "name", "bic", "adapter", "created_at")
SELECT gen_random_uuid(), v.name, NULL, v.adapter, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('finanzmining (cashbuzz)', 'FINNANZMINING')
) AS v(name, adapter)
WHERE NOT EXISTS (
  SELECT 1 FROM "financial_institutions" fi WHERE fi.adapter = v.adapter
);
