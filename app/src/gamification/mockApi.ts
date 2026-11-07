import type {
  CheckInResult,
  FinancialSnackDto,
  FlameTier,
  GamificationHubData,
  GamificationProfileDto,
  QuestChapterDto,
  SnackAnswerResult,
  WeeklyMoneyWrappedDto,
} from "./types";

/*
 * Gamification API layer.
 *
 * Strategy per the topic brief: components work FULLY from the mock when the
 * real endpoints are absent. If `fetch` exists, the Brief's live endpoints
 * (`/api/gamification/*`) are attempted first; any failure (no server, no
 * `/api` proxy, non-2xx, timeout) silently falls back to the FiCo demo data.
 * The hub never blocks the UI on the backend.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

/**
 * Canonical `/api/gamification/*` endpoints (Brief Topic 7). Centralised so a
 * final route-name mismatch with the API contracts is a one-line fix.
 */
export const GAMIFICATION_ENDPOINTS = {
  profile: (userId: string): string =>
    `${API_BASE}/api/gamification/profile?userId=${encodeURIComponent(userId)}`,
  checkIn: (): string => `${API_BASE}/api/gamification/check-in`,
  snackAnswer: (): string => `${API_BASE}/api/gamification/snacks/answer`,
  wrapped: (userId: string): string =>
    `${API_BASE}/api/gamification/wrapped/latest?userId=${encodeURIComponent(userId)}`,
} as const;

const FETCH_TIMEOUT_MS = 2500;

export function demoUserId(): string {
  return (
    (import.meta.env.VITE_DEMO_USER_ID ?? "").trim() ||
    "00000000-0000-4000-8000-000000000001"
  );
}

async function tryReal<T>(url: string, init?: RequestInit): Promise<T | null> {
  // Components work fully from mock when fetch (and .env VITE_API_URL) is absent.
  if (typeof globalThis.fetch === "undefined") return null;
  if (!url) return null;
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Strict members check so foreign server payloads cannot poison the UI state. */
async function tryRealProfile(userId: string): Promise<GamificationProfileDto | null> {
  const raw = await tryReal<Record<string, unknown>>(GAMIFICATION_ENDPOINTS.profile(userId));
  if (!raw || typeof raw.totalXp !== "number" || typeof raw.currentLevel !== "number") {
    return null;
  }
  return raw as unknown as GamificationProfileDto;
}

/*
 * ---------------------------------------------------------------------------
 * Streak flame tiers (§2): 4 weeks → Bronze, 12 → Silver, 26 → Gold, 52 →
 * Diamond. Exported for the flame card's tier ladder.
 */
export function flameTierForWeeks(weeks: number): FlameTier {
  if (weeks >= 52) return "diamond";
  if (weeks >= 26) return "gold";
  if (weeks >= 12) return "silver";
  if (weeks >= 4) return "bronze";
  return "none";
}

export const FLAME_TIER_LABELS: Record<FlameTier, string> = {
  none: "Flamme entzünden",
  bronze: "Bronze Flame",
  silver: "Silver Flame",
  gold: "Gold Flame",
  diamond: "Diamond Flame",
};

export const FLAME_TIER_THRESHOLDS: ReadonlyArray<{
  tier: Exclude<FlameTier, "none">;
  weeks: number;
}> = [
  { tier: "bronze", weeks: 4 },
  { tier: "silver", weeks: 12 },
  { tier: "gold", weeks: 26 },
  { tier: "diamond", weeks: 52 },
];

export const xpFloors = [0, 300, 800, 1600, 2800, 4500, 7000] as const;
export const MAX_LEVEL = 7;

/* ---------------------------------------------------------------------------
 * FiCo demo data — mirrors GAMIFICATION.md §3/§5/§6 example values.
 */

const DEMO_PROFILE: GamificationProfileDto = {
  userId: demoUserId(),
  totalXp: 2050,
  currentLevel: 3,
  levelTitle: "Debt Crusher",
  currentStreakWeeks: 14,
  longestStreakWeeks: 14,
  lastCheckInDate: "2026-11-01T17:30:00.000Z",
  streakFreezeCount: 2,
  completedSnacks: ["snack-rebalancing-12"],
  badges: ["bank_connected", "first_check_in", "one_month_streak"],
};

const DEMO_SNACKS: FinancialSnackDto[] = [
  {
    id: "snack-rebalancing-12",
    slug: "snack-rebalancing-12",
    category: "INVESTING",
    number: 12,
    title: "ETF-Rebalancing: Warum sollte ich mich kümmern, solange Kurse steigen?",
    bite: [
      "Stell dir dein Portfolio als RPG-Truppe vor: ⚔️ 70% Aktien (Angriff), 🛡️ 30% Anleihen (Deckung).",
      "Nach einem großen Börsen-Rally steht die Truppe bei ⚔️ 85% Angriff / 🛡️ 15% Deckung.",
      "Dein Risiko ist jetzt viel höher als geplant!",
      "Rebalancing = vom heißen Fund ein Teil verkaufen, vom schwachen nachkaufen — diszipliniert hoch verkaufen, ohne emotionales FOMO.",
    ],
    question:
      "Dein Aktienanteil ist in einem Bullenmarkt von 70% auf 85% gestiegen. Was macht Rebalancing?",
    options: [
      {
        id: "a",
        text: "Auf teure Tech-Stocks wetten und den Angriffsboost verdoppeln",
        correct: false,
      },
      {
        id: "b",
        text: "15% der Aktien verkaufen, um den Shield-Puffer wieder aufzufüllen",
        correct: true,
      },
      {
        id: "c",
        text: "Alles panisch verkaufen aufs Girokonto",
        correct: false,
      },
    ],
    xpReward: 25,
    wrongXpPenalty: 5,
  },
  {
    id: "snack-ter-13",
    slug: "snack-ter-13",
    category: "INVESTING",
    number: 13,
    title: "Was kostet eine 1,5%-ETF-Gebühr WIRKLICH?",
    bite: [
      "1,5% Prozent klingen harmlos. Aber über 35 Jahre bei €200/Monat und 7% Brutto:",
      "Bei 0,20% TER: ≈ €335.000. Bei 1,80% TER: ≈ €212.000.",
      "Die unscheinbare 1,6%-Lücke frisst €123.000+ — über 36% deines Vermögens!",
    ],
    question:
      "Wofür steht TER — und warum frisst 1,6% mehr an Rendite als eine einmalige Ordergebühr?",
    options: [
      {
        id: "a",
        text: "Total Expense Ratio — jährlich vom Fondsvermögen abgezogen",
        correct: true,
      },
      { id: "b", text: "Trade Execution Rate — einmalig pro Kauf", correct: false },
      { id: "c", text: "Tax Efficient Ratio — steuert die Abgeltungsteuer", correct: false },
    ],
    xpReward: 25,
    wrongXpPenalty: 5,
  },
  {
    id: "snack-haftpflicht-14",
    slug: "privathaftpflicht-liability",
    category: "INSURANCE",
    number: 14,
    title: "Privathaftpflicht vs. Kfz-Haftpflicht: Warum haftest du nach § 823 BGB unbegrenzt?",
    bite: [
      "§ 823 BGB: In Deutschland haftest du für verursachte Schäden mit 100 % deines aktuellen Vermögens UND allem künftigen Einkommen — lebenslang!",
      "Kfz-Haftpflicht ist gesetzliche Pflicht wegen der hohen kinetischen Betriebsgefahr eines Autos.",
      "Auf dem Fahrrad oder zu Fuß gibt es keine Pflicht — verursachst du aber unachtsam einen Personen- oder Zugunfall, schuldest du Millionen.",
      "Eine Privathaftpflicht (3–5 €/Monat im Nettotarif inkl. grober Fahrlässigkeit & Schlüsselverlust) ist dein wichtigster Anti-Ruin-Schild.",
    ],
    question:
      "Warum ist die Kfz-Haftpflicht gesetzlich vorgeschrieben, die Privathaftpflicht aber nicht?",
    options: [
      {
        id: "a",
        text: "Autos haben eine enorme kinetische Betriebsgefahr — der Staat schützt Dritte",
        correct: true,
      },
      {
        id: "b",
        text: "Mit dem Fahrrad oder als Fußgänger ist die Haftung auf 5.000 € begrenzt",
        correct: false,
      },
      {
        id: "c",
        text: "Privathaftpflicht zahlt ohnehin die gesetzliche Krankenkasse",
        correct: false,
      },
    ],
    xpReward: 25,
    wrongXpPenalty: 5,
  },
  {
    id: "snack-depot-15",
    slug: "altersvorsorgedepot-unpacked",
    category: "ALTERSVORSORGE",
    number: 15,
    title: "Altersvorsorgedepot 2026: Warum ist Riester gescheitert und was ist jetzt anders?",
    bite: [
      "Alte Riester-Verträge erzwangen gesetzlich eine 100 %-Beitragsgarantie.",
      "In der Nullzinsphase mussten Anbieter dein Geld deshalb in niedrig verzinste Anleihen statt in renditestarke Welt-Aktien stecken.",
      "Das neue Altersvorsorgedepot streicht diesen Garantiezwang: 100 % globale ETF-Rendite bei voller staatlicher Zulage und Steuerstundung!",
    ],
    question:
      "Was hat bei klassischen Riester-Verträgen über Jahrzehnte die Rendite junger Sparer abgewürgt?",
    options: [
      {
        id: "a",
        text: "Die starre 100 %-Beitragsgarantie zwang das Kapital in Zinspapiere statt Aktien-ETFs",
        correct: true,
      },
      {
        id: "b",
        text: "Riester war nur für Selbstständige erlaubt",
        correct: false,
      },
      {
        id: "c",
        text: "Man durfte nur im Dezember einzahlen",
        correct: false,
      },
    ],
    xpReward: 25,
    wrongXpPenalty: 5,
  },
];

const DEMO_WRAPPED: WeeklyMoneyWrappedDto = {
  weekNumber: 14,
  year: 2026,
  xpEarned: 150,
  streak: { weeks: 14, isStreakActive: true },
  cashflowPulse: {
    income: 1250.0,
    fixedCosts: 420.0,
    discretionarySpend: 210.0,
    discretionaryWithinTarget: true,
    freeSurplus: 620.0,
    routingNote: "➔ Zum Waterfall geroutet",
  },
  emergencyShield: {
    percent: 78,
    targetLabel: "3-Monats-Ziel",
    deltaThisWeek: 150.0,
  },
  bossDamage: {
    monster: "Allianz Gross Policy Monster",
    lifetimeFeesAvoided: 380.0,
    damageThisWeek: 380.0,
  },
  agenticHighlight: {
    emoji: "🚲",
    habit: "Du bist 4 Tage mit dem Rad statt mit ÖPNV gefahren",
    savedThisMonth: 15.2,
    depotProjection:
      "Verzinst ins Altersvorsorgedepot (7% p.a.) = €27.360 bei Rente!",
  },
};

const DEMO_CHAPTERS: QuestChapterDto[] = [
  {
    chapter: 1,
    title: "Chapter 1 · The Foundation",
    quests: [
      {
        id: "quest-1.1",
        chapter: 1,
        emoji: "🛡️",
        title: "Bank verbinden (AISP)",
        xp: 50,
        completed: true,
        requires: null,
        detail:
          "Verbinde dein erstes Bankkonto über Open Banking (AISP). FiCo kategorisiert danach automatisch Fixkosten und wiederkehrende Abbuchungen.",
      },
      {
        id: "quest-1.2",
        chapter: 1,
        emoji: "📊",
        title: "Fixkosten kategorisieren",
        xp: 75,
        completed: true,
        requires: "quest-1.1",
        detail:
          "Bestätige die automatisch vorgeschlagenen Fixkosten (Miete, Strom, Versicherungen). Damit kann der Cashflow-Waterfall rechnen.",
      },
      {
        id: "quest-1.3",
        chapter: 1,
        emoji: "🏰",
        title: "Baue den Shield auf",
        xp: 150,
        completed: true,
        requires: "quest-1.2",
        detail:
          "Notgroschen im Tagesgeld: 3 Monate Fixkosten als Ziel. Jede Woche deckt der Notgroschen-Progress die Emergency-Shield-Anzeige in deinem Weekly Money Wrapped.",
      },
    ],
  },
  {
    chapter: 2,
    title: "Chapter 2 · The Fee Slayer",
    quests: [
      {
        id: "quest-2.1",
        chapter: 2,
        emoji: "📄",
        title: "Erste Alt-Police scannen",
        xp: 100,
        completed: true,
        requires: "quest-1.3",
        detail:
          "Lade eine klassische Kapitallebens- oder Rentenversicherung per OCR-Scan hoch. FiCo extrahiert Zillmerung, Abschlusskosten und Stornowerte.",
      },
      {
        id: "quest-2.2",
        chapter: 2,
        emoji: "🥊",
        title: "Besiege das Zillmerung-Monster",
        xp: 200,
        completed: false,
        requires: "quest-2.1",
        detail:
          "Vergleiche gescannte vs. marktbeste Netztarife. Schritt über Smith den Abschlusskosten-Monster mitten im Rauswurf — XP gibt's für den dokumentierten Wechsel-Entscheid.",
      },
      {
        id: "quest-2.3",
        chapter: 2,
        emoji: "⚖️",
        title: "Netztarif-Wechsel-Check",
        xp: 250,
        completed: false,
        requires: "quest-2.2",
        detail:
          "Achte auf moderne Klauseln (grobe Fahrlässigkeit, Verlust des Schlüssels) und konvertiere Kernverträge auf provisionsfreie Netztarife. Belohnt als Lv-6-Bauteil Net-Tariff Ninja.",
      },
    ],
  },
  {
    chapter: 3,
    title: "Chapter 3 · The Wealth Engine",
    quests: [
      {
        id: "quest-3.1",
        chapter: 3,
        emoji: "🚀",
        title: "Altersvorsorgedepot eröffnen",
        xp: 300,
        completed: false,
        requires: "quest-2.3",
        detail:
          "Das neue Depot ohne garantierte Kapitalerhaltungs-Negative: 100% globale Aktien, staatliche Förderung, Steuer-Deferral. Vom Riester-Fiasco gelernt.",
      },
      {
        id: "quest-3.2",
        chapter: 3,
        emoji: "🔄",
        title: "Erster automatisierter Sweep",
        xp: 200,
        completed: false,
        requires: "quest-3.1",
        detail:
          "Richte den Monats-Sweep ein: Der freie Surplus nach dem Waterfall fließt automatisch ins Depot — Kopplung aus Micro-Habit und Zinseszins.",
      },
      {
        id: "quest-3.3",
        chapter: 3,
        emoji: "👑",
        title: "Financial Sovereignty",
        xp: 500,
        completed: false,
        requires: "quest-3.2",
        detail:
          "Cashflow-Waterfall im Gleichgewicht: Alle Fixkosten automatisiert, Shield voll, Sweep läuft. Titel: Financial Sovereign.",
      },
    ],
  },
];

export function derivenLevelFromXp(xp: number): number {
  let level = 1;
  for (let candidate = MAX_LEVEL; candidate >= 2; candidate -= 1) {
    if (xp >= (xpFloors[candidate - 1] ?? 0)) {
      level = candidate;
      break;
    }
  }
  return level;
}

export const LEVEL_TITLES = [
  "Budget Novice",
  "Shield Bearer",
  "Debt Crusher",
  "Fee Slayer",
  "Depot Pioneer",
  "Net-Tariff Ninja",
  "Financial Sovereign",
] as const;

export function levelTitleFor(level: number): string {
  return LEVEL_TITLES[Math.max(0, Math.min(level - 1, LEVEL_TITLES.length - 1))];
}

/* ---------------------------------------------------------------------------
 * Public API surface the components consume.
 */

export async function loadGamificationHub(userId: string): Promise<GamificationHubData> {
  const realProfile = await tryRealProfile(userId);
  const profile = realProfile ?? DEMO_PROFILE;

  const realWrapped = await tryReal<WeeklyMoneyWrappedDto>(GAMIFICATION_ENDPOINTS.wrapped(userId));
  const wrapped = realWrapped ?? DEMO_WRAPPED;

  // Snacks and the quest tree are content the demo data seeds — Topic 7's
  // route set (profile/check-in/snack-answer/quest-complete) carries no bulk
  // content GET, so the embedded demo stays the content source until the API
  // contract adds one.
  return {
    dataSource: realProfile ? "api" : "demo",
    profile,
    wrapped,
    snacks: DEMO_SNACKS,
    chapters: DEMO_CHAPTERS,
  };
}

/** Weekly streak check-in. Real endpoint first, demo fallback mirrors §2 XP. */
export async function submitCheckIn(userId: string): Promise<CheckInResult> {
  const real = await tryReal<CheckInResult>(GAMIFICATION_ENDPOINTS.checkIn(), {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (real && typeof real.xpGained === "number") return real;
  return { xpGained: 150, currentStreakWeeks: DEMO_PROFILE.currentStreakWeeks + 1 };
}

/**
 * Snack quiz answer. Real endpoint first; the fallback evaluates locally with
 * the §5 rule: correct → +25 XP, wrong → −5 XP.
 */
export async function submitSnackAnswer(input: {
  userId: string;
  snackSlug: string;
  optionId: string;
}): Promise<SnackAnswerResult> {
  const real = await tryReal<SnackAnswerResult>(GAMIFICATION_ENDPOINTS.snackAnswer(), {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (real && typeof real.correct === "boolean") {
    return { ...real, correctOptionId: real.correctOptionId ?? null };
  }

  const snack = DEMO_SNACKS.find((candidate) => candidate.slug === input.snackSlug);
  if (!snack) return { correct: false, xpGained: 0, correctOptionId: null };
  const chosen = snack.options.find((option) => option.id === input.optionId);
  const correctOption = snack.options.find((option) => option.correct === true) ?? null;
  const correct = chosen?.correct === true;
  return {
    correct,
    xpGained: correct ? snack.xpReward : -snack.wrongXpPenalty,
    correctOptionId: correctOption?.id ?? null,
  };
}

export const DEMO_CONTENT = {
  snacks: DEMO_SNACKS,
  wrapped: DEMO_WRAPPED,
  chapters: DEMO_CHAPTERS,
} as const;
