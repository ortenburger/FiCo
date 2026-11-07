-- Gamification tables (decoupled from ledger)

CREATE TABLE "user_gamification_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "current_streak_weeks" INTEGER NOT NULL DEFAULT 0,
    "longest_streak_weeks" INTEGER NOT NULL DEFAULT 0,
    "last_check_in_date" TIMESTAMPTZ(6),
    "streak_freeze_count" INTEGER NOT NULL DEFAULT 1,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "completed_snacks" JSONB NOT NULL DEFAULT '[]',
    "badges" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_gamification_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_gamification_profiles_user_id_key" ON "user_gamification_profiles"("user_id");

CREATE TABLE "weekly_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "savings_total" DECIMAL(12,2) NOT NULL,
    "fees_avoided" DECIMAL(12,2) NOT NULL,
    "xp_earned" INTEGER NOT NULL,
    "micro_habit_story" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "weekly_summaries_user_id_year_week_number_idx" ON "weekly_summaries"("user_id", "year", "week_number");

CREATE TABLE "financial_snacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" JSONB NOT NULL,
    "quiz" JSONB NOT NULL,
    "xp_reward" INTEGER NOT NULL DEFAULT 25,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_snacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_snacks_slug_key" ON "financial_snacks"("slug");

ALTER TABLE "user_gamification_profiles"
  ADD CONSTRAINT "user_gamification_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "weekly_summaries"
  ADD CONSTRAINT "weekly_summaries_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
