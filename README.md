# FiCo — FL-NTOE

Autonomous **Financial Ledger & Net-Tariff Orchestration Engine** for DE/EU WealthTech & InsurTech (PSD2/PSD3, ZAG, § 34d GewO, § 2 Abs. 2 Nr. 4 WpIG, § 48b VAG).

## Bounded contexts

| Context | Package | Boundary |
| --- | --- | --- |
| A — Open Finance Ingestion | `@fico/aisp`, `@fico/workers` | AISP read-only (no PISP) |
| B — Core Financial Ledger | `@fico/ledger` | Append-only double-entry + waterfall; no ISIN advice |
| C — Policy / Net-Broker | `@fico/policy` | Economic gate before finexpert; no § 48b kickbacks |

Regulatory firewalls live in `@fico/regulatory`.

## Monorepo layout

```
packages/
  db/           Prisma schema + PostgreSQL migrations
  ledger/       Double-entry OCC engine + cash waterfall
  regulatory/   WpIG guard, VAG invariants, underwriting chasm lock
  aisp/         HMAC webhooks, recurring classifier, SCA lifecycle
  policy/       OCR heuristics, economic gate, finexpert client + circuit breaker
  api/          Fastify edge API (sync, no upstream HTTP)
  workers/      BullMQ workers (all external I/O)
```

## Quick start

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm test
pnpm dev:api
```

## Phase status

1. **Phase 1 — Ledger & storage:** PostgreSQL schema, journal/ledger lines, versioned OCC balance updates, race-condition tests.
2. **Phase 2 — Ingestion & waterfall:** AISP HMAC + classifier, deterministic emergency-buffer waterfall, § 2 Abs. 2 Nr. 4 WpIG router.
3. **Phase 3 — Policy gateway:** Local OCR heuristics, uneconomic P&C short-circuit, finexpert client with exponential backoff + circuit breaker.

## Hard invariants

- External HTTP **never** runs inside DB transactions or API request threads — only in `@fico/workers`.
- Specific security buy/sell recommendations are blocked (`evaluateInvestmentQuery`).
- Cancellation letters require `CANCELLATION_ALLOWED` after cryptographically verified `POLICY_ISSUED`.
- No broker-commission-to-user tables; only `advisory_fee_invoices` (§ 34d / § 48b).
- Document workers enforce `max_concurrency = floor(RAM_MB / 256)`.
