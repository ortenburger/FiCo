-- Seed HonorarKonzept + con.fee Nettotarif partners

INSERT INTO "financial_institutions" ("id", "name", "bic", "adapter", "created_at")
SELECT gen_random_uuid(), v.name, NULL, v.adapter, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('HonorarKonzept GmbH', 'HONORARKONZEPT'),
    ('con.fee AG', 'CONFEE')
) AS v(name, adapter)
WHERE NOT EXISTS (
  SELECT 1 FROM "financial_institutions" fi WHERE fi.adapter = v.adapter
);
