# FiCo Gamification Architecture: Duolingo for Financial Sovereignty 🎮

> *"Making personal finance as engaging as learning a language on Duolingo, turning abstract 40-year compound interest into tangible, weekly micro-wins."*

---

## 🧭 1. Vision & Core Philosophy

Traditional personal finance apps fail Gen Z and Millennials because they are:
1. **Anxiety-inducing:** Depressing red budgets and endless balance sheets that make users feel guilty for spending money.
2. **Cognitively exhausting:** 40-page insurance policies, complex tax codes, and opaque investment jargon.
3. **Temporally disconnected:** Saving for retirement in 40 years feels completely disconnected from daily life.

**FiCo adapts the proven behavioral psychology of Duolingo to finance:**
- **Micro-Habits over Heavy Lifts:** Transforming financial literacy into bite-sized, 2-minute weekly interactions.
- **Positive Reinforcement:** Rewarding smart cashflow choices and fee reductions rather than shaming discretionary spending.
- **Tangible Compounding:** Instantly converting everyday micro-savings (e.g. cycling to work, switching electricity tariffs) into real projected future wealth in the new **Altersvorsorgedepot**.
- **Agentic Automation:** Background AI agents do the heavy number-crunching, surfacing only actionable, rewarding decisions.

---

## ⚡ 2. The Core Habit Loop: Weekly Streaks

Unlike language learning, which thrives on daily repetition, **daily streaks in personal finance cause fatigue and churn**. Bank transactions, salaries, and investment cycles move on weekly and monthly intervals.

Therefore, FiCo introduces the **Weekly Streak (The Sunday Money Ritual)**.

```
       ┌────────────────────────────────────────────────────────┐
       │             THE SUNDAY MONEY RITUAL (2 min)            │
       │                                                        │
       │  1. Review Weekly Recap (Story/Slide Format)           │
       │  2. Claim Weekly XP & Extend Streak Flame 🔥           │
       │  3. Agentic Micro-Quest Validation                     │
       │  4. Route Free Surplus via Cash Waterfall Engine       │
       └────────────────────────────────────────────────────────┘
```

### Streak Mechanics
- **The Threshold:** Minimum **1 meaningful check-in per week** (Friday to Sunday evening).
- **Streak Flame & Multipliers:**
  - `4-Week Streak (1 Month)` $\rightarrow$ **Bronze Flame** + Unlock "Fee Audit Tool"
  - `12-Week Streak (Quarter)` $\rightarrow$ **Silver Flame** + 1.25x XP Multiplier on Savings Challenges
  - `26-Week Streak (Half-Year)` $\rightarrow$ **Gold Flame** + Free Contract OCR Scan
  - `52-Week Streak (1 Year Sovereign)` $\rightarrow$ **Diamond Flame** + "Master of Compounding" Badge
- **Streak Freezes & Shields (No Pay-to-Win):**
  - Users do *not* buy streak freezes with real money.
  - Streak Freezes are **earned** through responsible financial behavior (e.g., maintaining an emergency fund, not touching savings, or completing a financial education micro-quiz).

---

## 📊 3. The "Weekly Money Wrapped" (Automated Recap)

Every Sunday afternoon, the `@fico/workers` engine generates an interactive, personalized **Weekly Story** (inspired by Spotify Wrapped and Duolingo Weekly Reports).

```
╔════════════════════════════════════════════════════════════════════════╗
║                      YOUR WEEKLY MONEY WRAPPED ⚡                       ║
║                                                                        ║
║  🔥 WEEK 14 STREAK ACTIVE! (+150 XP)                                   ║
║                                                                        ║
║  💰 CASHFLOW PULSE:                                                    ║
║     • Income received:       €1,250.00                                 ║
║     • Fixed costs paid:        €420.00                                 ║
║     • Discretionary spend:     €210.00 (within target!)                ║
║     • Free Surplus:            €620.00 ➔ Routed to Waterfall           ║
║                                                                        ║
║  🛡️ EMERGENCY SHIELD:                                                 ║
║     [██████████████████░░░░] 78% of 3-month target (+€150 this week)   ║
║                                                                        ║
║  🥊 BOSS DAMAGE REPORT (Lifetime Fees Avoided):                        ║
║     You deal €380 damage to "Allianz Gross Policy Monster"!            ║
║                                                                        ║
║  🌱 AGENTIC HABIT HIGHLIGHT:                                           ║
║     "You cycled 4 days instead of taking transit (€15.20 saved).      ║
║      Compounded into Altersvorsorgedepot = €27,360 at retirement!"     ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## 🤖 4. Agentic Integrations: Turning Everyday Choices into Compounding Wealth

FiCo leverages autonomous background agents that observe cross-domain data feeds and calculate their **long-term wealth impact**.

### A. Mobility: "Bike vs. Public Transit / Uber"
- **Data Hook:** AISP transaction monitoring (categorizing transport expenses like Bahn, BVG, Uber, Lime, or petrol) combined with optional mobility health/GPS APIs.
- **The Calculation:** 
  $$\text{Daily Transit Cost} = €3.80 \times 2 = €7.60$$
  If the user commutes by bicycle 3 days a week:
  $$\text{Monthly Savings} \approx €91.20$$
- **The Altersvorsorgedepot Projection:**
  The agent translates this into long-term wealth:
  > *"By biking 3x/week, you save €91/month. If our auto-sweep routes this into your **Altersvorsorgedepot** at 7% p.a. over 35 years, this single habit yields **€164,000+** at retirement!"*

### B. Energy & Smart Grid: Dynamic Tariffs (e.g., Tibber / Smart Meters)
- **Data Hook:** Smart meter consumption API or utility webhook.
- **The Action:** FiCo's Energy Agent detects energy usage patterns and off-peak charging.
- **The Quest:** *"Vampire Load Hunt"* — identifying continuous standby power draws (>100W at 3 AM).
  > *"Eliminating your 80W standby drain saves €210/year. That's €34,500 more in your Altersvorsorgedepot."*

### C. The Subscription Detective & Zombie Cleaner
- **Data Hook:** AISP recurring transaction classifier (`@fico/aisp/recurring-classifier`).
- **The Interaction:** The agent detects dual streaming subscriptions or forgotten trial periods.
- **One-Tap Execution:** Generates a cancellation letter and asks: *"Should we redirect this €17.99/mo to your Altersvorsorgedepot ETF plan?"*

---

## 🌳 5. The Financial Skill Tree: RPG Progression

Users progress along a visual **Skill Tree** structured into distinct Chapters:

```
[Chapter 1: The Foundation]
        │
        ├── 🛡️ Quest 1.1: Connect Bank (AISP) ─────────► [50 XP]
        ├── 📊 Quest 1.2: Categorize Fixed Costs ──────► [75 XP]
        └── 🏰 Quest 1.3: Build The Shield (Emergency) ─► [150 XP]
                    │
[Chapter 2: The Fee Slayer]
        │
        ├── 📄 Quest 2.1: Scan 1st Legacy Policy ──────► [100 XP]
        ├── 🥊 Quest 2.2: Defeat "Zillmerung Monster" ──► [200 XP]
        └── ⚖️ Quest 2.3: Net-Tariff Switch Check ─────► [250 XP]
                    │
[Chapter 3: The Wealth Engine]
        │
        ├── 🚀 Quest 3.1: Open Altersvorsorgedepot ────► [300 XP]
        ├── 🔄 Quest 3.2: First Automated Sweep ───────► [200 XP]
        └── 👑 Quest 3.3: Financial Sovereignty ───────► [500 XP]
```

### Character Titles / Badges
| Level | Title | Requirement |
| --- | --- | --- |
| **Lv 1** | Budget Novice | Connect first bank account via AISP |
| **Lv 2** | Shield Bearer | 1 Month fixed costs in Tagesgeld reserve |
| **Lv 3** | Debt Crusher | All high-interest debt (>4% APR) paid off |
| **Lv 4** | Fee Slayer | At least 1 legacy contract audited and unmasked |
| **Lv 5** | Depot Pioneer | Active Altersvorsorgedepot with automated monthly sweep |
| **Lv 6** | Net-Tariff Ninja | Core insurance converted to zero-commission net tariffs |
| **Lv 7** | Financial Sovereign | Full cashflow waterfall automated in equilibrium |

---

## 🤝 6. Cooperative Guilds (No Toxic Wealth Flexing)

Most finance leaderboards fail because **displaying net worth creates shame and toxic comparisons**. 

FiCo uses **Cooperative Financial Guilds**:
- **Team Quests:** A group of friends or colleagues forms a Guild (e.g., *"Stuttgart Founders Guild"*).
- **Collective Metrics:**
  - Total High-Interest Debt Eliminated by the Guild: *€14,800*
  - Total Hidden Broker Fees Avoided: *€89,200*
  - Combined Weekly Streak: *38 Weeks*
- **Team Rewards:** Unlocking group badges and shared milestone celebrations.

---

## 🛠️ 7. Technical Data Architecture

The gamification layer is fully decoupled from the core double-entry ledger to guarantee financial auditability:

```
┌─────────────────────────────────────────────────────────────┐
│                    Gamification Engine                      │
│      (Streaks, XP, Weekly Summaries, Quests, Badges)        │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
    ┌────────────────────┐          ┌────────────────────┐
    │  @fico/ledger      │          │  @fico/aisp        │
    │  - Balance states  │          │  - Recurring costs │
    │  - Waterfall logic │          │  - Transaction tags│
    └────────────────────┘          └────────────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  @fico/workers     │
                    │  Weekly Cron Jobs  │
                    │  Agent Integrations│
                    └────────────────────┘
```

### Prisma Schema Extension (Scaffold)
```prisma
model UserGamificationProfile {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId             String    @unique @db.Uuid
  currentStreakWeeks Int       @default(0)
  longestStreakWeeks Int       @default(0)
  lastCheckInDate    DateTime? @db.Timestamptz(6)
  streakFreezeCount  Int       @default(1)
  totalXp            Int       @default(0)
  currentLevel       Int       @default(1)
  badges             Json      @default("[]")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model WeeklySummary {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId          String   @db.Uuid
  weekNumber      Int
  year            Int
  savingsTotal    Decimal  @db.Decimal(12, 2)
  feesAvoided     Decimal  @db.Decimal(12, 2)
  xpEarned        Int
  microHabitStory Json
  createdAt       DateTime @default(now()) @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 🏁 Summary: Why This Wins Gen Z & Hackathons

1. **Emotional Connection:** Changes personal finance from an intimidating chore into an empowering personal RPG.
2. **Real Economic Impact:** Bridges the gap between micro-habits (cycling, smart power) and macro wealth (**Altersvorsorgedepot**).
3. **Sustainable Engagement:** Weekly cadence prevents notification fatigue while building lifelong financial habits.
