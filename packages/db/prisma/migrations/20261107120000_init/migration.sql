-- FiCo FL-NTOE initial schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'DEPOT', 'CREDIT_CARD', 'LOAN');
CREATE TYPE "TransactionCategory" AS ENUM ('INCOME', 'FIXED_COST', 'VARIABLE_SPEND', 'SAVINGS_INVESTMENT', 'DEBT_SERVICE');
CREATE TYPE "PolicyType" AS ENUM ('TERM_LIFE', 'BU_DISABILITY', 'PRIVATE_HEALTH', 'PENSION_BASE', 'PENSION_PRIVATE', 'PENSION_OCCUPATIONAL', 'PROPERTY_CASUALTY', 'LEGAL_PROTECTION', 'PET_HEALTH');
CREATE TYPE "PolicyCostStructure" AS ENUM ('COMMISSION_ZILLMERIZED', 'GROSS_STANDARD', 'NET_HONORAR');
CREATE TYPE "FbTriggerStatus" AS ENUM ('SKIPPED_UNECONOMIC', 'PENDING_APPROVAL', 'DISPATCHED', 'COMPLETED', 'FAILED', 'REJECTED');
CREATE TYPE "ConsentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'ACTIVE_SUBSCRIBER');
CREATE TYPE "PolicySwitchStatus" AS ENUM ('DRAFT', 'SYNOPSIS_COMPLETE', 'APPLICATION_SUBMITTED', 'UNDERWRITING', 'POLICY_ISSUED', 'CANCELLATION_ALLOWED', 'CANCELLED', 'REJECTED_UNDERWRITING');
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'VOIDED');

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "financial_institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "bic" VARCHAR(11),
    "adapter" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_institutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "external_consent_id" VARCHAR(255) NOT NULL,
    "sca_valid_until" TIMESTAMPTZ(6) NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "consent_id" UUID,
    "type" "AccountType" NOT NULL,
    "iban" VARCHAR(34),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "balance_amount" DECIMAL(14,2) NOT NULL,
    "balance_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "external_id" VARCHAR(255),
    "booking_date" DATE NOT NULL,
    "value_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "counterparty_name" VARCHAR(255),
    "counterparty_iban" VARCHAR(34),
    "remittance_info" TEXT,
    "category" "TransactionCategory",
    "sub_category" VARCHAR(64),
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "reference" VARCHAR(128),
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "memo" VARCHAR(255),
    CONSTRAINT "ledger_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider_name" VARCHAR(255) NOT NULL,
    "policy_number" VARCHAR(128),
    "policy_type" "PolicyType" NOT NULL,
    "cost_structure" "PolicyCostStructure" NOT NULL,
    "monthly_premium" DECIMAL(10,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "guaranteed_interest_rate" DECIMAL(4,2),
    "estimated_commission_alpha_pct" DECIMAL(4,2),
    "raw_document_s3_key" VARCHAR(512),
    "document_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fb_synopsis_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "trigger_status" "FbTriggerStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "input_payload" JSONB NOT NULL,
    "raw_synopsis_response" JSONB,
    "score_delta_json" JSONB,
    "estimated_cost_reduction_riy" DECIMAL(4,3),
    "executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fb_synopsis_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "policy_switch_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "source_policy_id" UUID NOT NULL,
    "target_carrier_ref" VARCHAR(128) NOT NULL,
    "status" "PolicySwitchStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_confirmation_hash" VARCHAR(128),
    "cancellation_letter_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "policy_switch_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "allocation_profiles" (
    "user_id" UUID NOT NULL,
    "target_buffer_months" DECIMAL(3,1) NOT NULL DEFAULT 3.0,
    "current_buffer_target_amount" DECIMAL(12,2) NOT NULL,
    "emergency_fund_account_id" UUID,
    "target_equity_ratio" DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    "rebalancing_threshold_pct" DECIMAL(3,2) NOT NULL DEFAULT 0.05,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "allocation_profiles_pkey" PRIMARY KEY ("user_id")
);

-- Advisory / software fees only — NO kickback ledgers (§ 48b VAG)
CREATE TABLE "advisory_fee_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "amount_eur" DECIMAL(10,2) NOT NULL,
    "fee_type" VARCHAR(64) NOT NULL,
    "description" TEXT NOT NULL,
    "billed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "advisory_fee_invoices_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "bank_consents" ADD CONSTRAINT "bank_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_consents" ADD CONSTRAINT "bank_consents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "bank_consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_lines" ADD CONSTRAINT "ledger_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fb_synopsis_runs" ADD CONSTRAINT "fb_synopsis_runs_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_switch_cases" ADD CONSTRAINT "policy_switch_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy_switch_cases" ADD CONSTRAINT "policy_switch_cases_source_policy_id_fkey" FOREIGN KEY ("source_policy_id") REFERENCES "insurance_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allocation_profiles" ADD CONSTRAINT "allocation_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allocation_profiles" ADD CONSTRAINT "allocation_profiles_emergency_fund_account_id_fkey" FOREIGN KEY ("emergency_fund_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique / indexes
CREATE UNIQUE INDEX "uq_user_institution_consent" ON "bank_consents"("user_id", "institution_id");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE UNIQUE INDEX "uq_account_tx" ON "transactions"("account_id", "external_id");
CREATE INDEX "idx_transactions_account_date" ON "transactions"("account_id", "booking_date" DESC);
CREATE INDEX "idx_transactions_recurring" ON "transactions"("account_id") WHERE "is_recurring" IS TRUE;
CREATE INDEX "journal_entries_user_id_posted_at_idx" ON "journal_entries"("user_id", "posted_at" DESC);
CREATE INDEX "ledger_lines_account_id_idx" ON "ledger_lines"("account_id");
CREATE INDEX "insurance_policies_user_id_idx" ON "insurance_policies"("user_id");
CREATE INDEX "fb_synopsis_runs_policy_id_idx" ON "fb_synopsis_runs"("policy_id");
CREATE INDEX "policy_switch_cases_user_id_idx" ON "policy_switch_cases"("user_id");
CREATE INDEX "advisory_fee_invoices_user_id_idx" ON "advisory_fee_invoices"("user_id");
