/**
 * Financial Snacks content (GAMIFICATION.md §5) as typed data.
 *
 * This file is pure data — no logic. The engine lives in snacks.ts. Content is
 * imported type-only from snacks.ts, so there is no runtime import cycle.
 */
import type { FinancialSnack } from "./snacks.js";

/**
 * The four official launch snacks from GAMIFICATION.md §5.
 *
 * Quiz option ordering and labels for Snack 1 are verbatim from §5. Snacks 2–4
 * get quizzes in the same Duolingo style (correct option always carries
 * `isCorrect: true`); narrative steps quote the §5 texts.
 */
export const DEFAULT_SNACKS: FinancialSnack[] = [
  {
    id: "snack_01_etf_rebalancing",
    slug: "etf-rebalancing-checkpoint",
    category: "INVESTING",
    stage: "FOUNDATION",
    title: "The ETF Rebalancing Checkpoint",
    heroLine: "Wait... what does REBALANCING an ETF actually mean?",
    steps: [
      {
        heading: "The Question",
        body: "Why should I care about rebalancing if stocks keep going up?",
      },
      {
        heading: "The Bite",
        body: "In a multi-asset portfolio, equities grow faster than cash or bonds, subtly turning a moderate investor into an aggressive gambler right before a market dip.",
        bullets: [
          "⚔️ Your RPG squad starts at 70% Attack (Global Equities) / 30% Defense (Bonds & Money Market).",
          "📈 After a big rally it drifts to 85% Attack / 15% Defense — way more risk than you chose.",
          "👉 Rebalancing = selling a bit of what ran hot, buying the dip on what lagged. Profit-taking without emotional FOMO.",
        ],
      },
    ],
    quiz: {
      question:
        "Your equity share spiked from 70% to 85% during a bull market. What does rebalancing do?",
      options: [
        { label: "Double down on high-beta tech stocks", isCorrect: false },
        { label: "Sell 15% of equities to replenish the shield buffer", isCorrect: true },
        { label: "Panic sell everything into checking account", isCorrect: false },
      ],
    },
    xpReward: 25,
  },
  {
    id: "snack_02_silent_wealth_killer",
    slug: "silent-wealth-killer-ter",
    category: "INVESTING",
    stage: "FEE_SLAYER",
    title: 'The Silent Wealth Killer — "How much does a 1.5% ETF / Fund Fee REALLY cost?"',
    heroLine: "A 1.5% management fee sounds tiny. What's 1.5 out of 100?",
    steps: [
      {
        heading: "The Myth",
        body: "A 1.5% management fee sounds tiny. What's 1.5 out of 100? Cheap, right?",
      },
      {
        heading: "The Eye-Opener Math",
        body: "Over a 35-year investment horizon with €200/month at 7% gross return, that tiny fee compounds into a fortune you never see.",
        bullets: [
          "At ~0.20% TER (Clean ETF in Altersvorsorgedepot): ≈ €335,000.",
          "At a painful TER on a traditional active bank/insurance fund: you land miles behind — the fee delta devoured over €100,000, more than 30% of your lifetime wealth.",
          "Drag the TER slider in the simulator and watch the compound curve collapse in real time.",
        ],
      },
    ],
    quiz: {
      question:
        "Over 35 years (€200/month, 7% gross), a ~1.6% higher TER on your fund roughly costs you…",
      options: [
        { label: "A rounding error — fees are charged on tiny amounts", isCorrect: false },
        { label: "Over €100,000 — more than 30% of your total lifetime wealth", isCorrect: true },
        { label: "Nothing, as long as the fund performs well", isCorrect: false },
      ],
    },
    xpReward: 25,
    simulator: {
      kind: "TER_SLIDER",
      terMinPct: 0.2,
      terMaxPct: 2.5,
      monthlyEur: 200,
      years: 35,
      ratePct: 7,
      baselineTerPct: 0.2,
      compareTerPct: 1.8,
    },
  },
  {
    id: "snack_03_privathaftpflicht",
    slug: "liability-demystified",
    category: "INSURANCE",
    stage: "FEE_SLAYER",
    title:
      'Liability Demystified — "Do I really need a Privathaftpflicht? Why is Car Liability legally mandatory but Bicycle isn\'t?"',
    heroLine: "One wrong glance at your phone on a bike can cost you €3,000,000+ — for life.",
    steps: [
      {
        heading: "The Legal Reality (§ 823 BGB)",
        body: "In Germany, you are personally liable for damages you cause with 100% of your current assets and all future earnings, for life, without limit.",
      },
      {
        heading: "The Comparison",
        body: "Why is one liability insurance mandatory and the other not?",
        bullets: [
          "🚗 Kfz-Haftpflicht: YES, legally mandatory (Pflichtversicherungsgesetz) — cars carry massive kinetic energy (Betriebsgefahr), so the state protects third-party victims. Uninsured? The state seizes your license plate immediately.",
          "🚲 Privathaftpflicht: NO, not mandated — bicycles and pedestrians have lower statistical kinetic energy. But: cause an ICE train or bus crash while glancing at your phone, and you owe €3,000,000+ out of pocket for life.",
        ],
      },
      {
        heading: "The Takeaway",
        body: "A €3–€5/month Privathaftpflicht is the cheapest anti-ruin shield in the world. FiCo checks whether your policy includes modern clauses (grobe Fahrlässigkeit / loss of keys).",
      },
    ],
    quiz: {
      question: "Why is Kfz-Haftpflicht (car liability) legally mandatory, but bicycle liability not?",
      options: [
        { label: "Cars are expensive, bicycles are cheap", isCorrect: false },
        {
          label: "Cars carry inherent operational danger — the state wants to protect third-party victims",
          isCorrect: true,
        },
        { label: "Bicycle riders are legally liable for nothing", isCorrect: false },
      ],
    },
    xpReward: 25,
  },
  {
    id: "snack_04_altersvorsorgedepot",
    slug: "altersvorsorgedepot-unpacked",
    category: "ALTERSVORSORGE",
    stage: "WEALTH_ENGINE",
    title: 'The Altersvorsorgedepot Unpacked — "Why did Riester fail, and why is the new depot different?"',
    heroLine: "Riester forced providers into bonds. The new depot lets compounding breathe.",
    steps: [
      {
        heading: "The Bite",
        body: "Old Riester plans legally forced providers to offer a 100% nominal capital guarantee. In a zero-interest era, providers were forced to park your money in negative-yielding bonds rather than equities.",
      },
      {
        heading: "Why the New Depot Is Different",
        body: "The new Altersvorsorgedepot drops this restrictive guarantee, letting young people harness 100% global equity compounding while still enjoying government matching and tax deferral.",
      },
    ],
    quiz: {
      question: "Why did the classic Riester plan fail young savers?",
      options: [
        { label: "The guarantee FORCED providers into low/negative-yield bonds instead of equities", isCorrect: true },
        { label: "Riester was only available to civil servants", isCorrect: false },
        { label: "The government took the money back at retirement", isCorrect: false },
      ],
    },
    xpReward: 25,
  },
];
