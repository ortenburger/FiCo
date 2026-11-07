const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export type ProfileField = "salary" | "marital_status";

export type ProfilePatch = Partial<Record<ProfileField, string>>;

/**
 * The voice agent works with the intake vocabulary ("salary", "marital_status")
 * while the API speaks the persisted domain vocabulary
 * (grossMonthlyIncome, maritalStatus). This maps between both sides.
 */
export const MARITAL_STATUS_VALUES = [
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "WIDOWED",
  "REGISTERED_PARTNERSHIP",
] as const;

export type MaritalStatus = (typeof MARITAL_STATUS_VALUES)[number];

const MARITAL_STATUS_ALIASES: Record<string, MaritalStatus> = {
  single: "SINGLE",
  ledig: "SINGLE",
  unverheiratet: "SINGLE",
  married: "MARRIED",
  verheiratet: "MARRIED",
  verheiratete: "MARRIED",
  divorced: "DIVORCED",
  geschieden: "DIVORCED",
  widowed: "WIDOWED",
  verwitwet: "WIDOWED",
  "registered partnership": "REGISTERED_PARTNERSHIP",
  registered_partnership: "REGISTERED_PARTNERSHIP",
  eingetragene_partnerschaft: "REGISTERED_PARTNERSHIP",
  "eingetragene partnerschaft": "REGISTERED_PARTNERSHIP",
};

export function normalizeMaritalStatus(value: string): MaritalStatus | null {
  const normalized = value.trim().toLowerCase();
  return MARITAL_STATUS_ALIASES[normalized] ?? null;
}

/**
 * The salary reaches us as free text ("5.000 Euro", "5000 EUR", "5k").
 * Returns the gross monthly income in euros, or null when unparseable.
 */
/**
 * The salary reaches us as free text ("5.000 Euro", "5000 EUR", "5k").
 * Returns the gross monthly income in euros, or null when unparseable.
 *
 * Parsing strategy: strip currency and unit words first, keeping the digits.
 * A single "first number" wins, because the agent may add trailing context
 * ("5000 Euro brutto im Monat").
 *
 * Number format: German convention — "." groups thousands, "," is the decimal
 * separator. "5.000" is five thousand, not five.
 */
export function parseSalary(value: string): number | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[€]/g, " ")
    .replace(/\b(euros?|eur|monatlich|monat|brutto|netto|gehalt|pro)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "5k" / "5.5k" → 5000 / 5500
  const kMatch = normalized.match(/^([0-9]+(?:[.,][0-9]+)?)\s*k$/);
  if (kMatch) {
    const base = Number(kMatch[1]!.replace(",", "."));
    return Number.isFinite(base) ? base * 1000 : null;
  }

  // Take the first number token: "5.000" / "5.000,50" / "5000.50"
  const numberMatch = normalized.match(/([0-9]+(?:[.,][0-9]+)*)/);
  if (!numberMatch) return null;

  const raw = numberMatch[1]!;

  const parsed = parseGermanNumber(raw);
  if (parsed === null || parsed < 0) return null;
  return parsed;
}

/**
 * Parses a numeric token using German conventions.
 *
 * "." groups thousands and "," is the decimal separator, so "5.000" is 5000
 * and "5.000,50" is 5000.50. Plain integers and plain English decimals
 * ("5000.50") are accepted too — an English decimal point is only treated as
 * a decimal when it is followed by exactly one or two digits.
 */
function parseGermanNumber(raw: string): number | null {
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    // "5.000,50" — dot thousands, comma decimal
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }

  if (hasComma) {
    // "5000,50" — comma decimal
    return Number(raw.replace(",", "."));
  }

  if (hasDot) {
    // "5.000" — dot groups thousands
    // "5000.50" — English decimal, only with exactly 1-2 trailing digits
    const trailing = raw.split(".").pop() ?? "";
    const isEnglishDecimal = trailing.length <= 2 && raw.indexOf(".") > 0;
    return Number(isEnglishDecimal ? raw : raw.replace(/\./g, ""));
  }

  return Number(raw);
}

export type ProfileUpdateResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "http" | "network"; detail?: string };

type CopilotAllowed = {
  allowed: true;
  mode?: string;
  response?: string;
};

type CopilotBlocked = {
  allowed: false;
  code?: string;
  message: string;
};

type CopilotPayload = CopilotAllowed | CopilotBlocked;

/**
 * Maps one voice-intake field onto the API's profile contract and persists it.
 * The API uses PUT /v1/profile with a partial body, so a single intake answer
 * never overwrites the other attributes.
 */
export async function postProfileField(
  field: ProfileField,
  value: string,
  userId: string,
): Promise<ProfileUpdateResult> {
  const body: Record<string, string | number> = { userId };

  if (field === "salary") {
    const salary = parseSalary(value);
    if (salary === null) {
      return { ok: false, reason: "invalid", detail: value };
    }
    body.grossMonthlyIncome = salary;
  } else {
    const maritalStatus = normalizeMaritalStatus(value);
    if (maritalStatus === null) {
      return { ok: false, reason: "invalid", detail: value };
    }
    body.maritalStatus = maritalStatus;
  }

  try {
    const response = await fetch(apiUrl("/v1/profile"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, reason: "http", detail: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (caught) {
    return {
      ok: false,
      reason: "network",
      detail: caught instanceof Error ? caught.message : "unknown error",
    };
  }
}

export async function askCopilot(question: string): Promise<string> {
  const trimmed = question.trim();
  if (!trimmed) {
    return "Bitte stelle eine konkrete Frage.";
  }

  let response: Response;
  try {
    response = await fetch(apiUrl("/v1/copilot/query"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
    });
  } catch {
    return "Die FiCo-Engine ist gerade nicht erreichbar. Starte den API-Server und versuche es erneut.";
  }

  let payload: CopilotPayload;
  try {
    payload = (await response.json()) as CopilotPayload;
  } catch {
    return "Ungültige Antwort von der FiCo-Engine.";
  }

  if (!payload.allowed) {
    return payload.message ?? "Diese Frage ist vom WpIG-Guard blockiert.";
  }

  if (payload.response?.trim()) {
    return payload.response.trim();
  }

  return "Macro allocation analysis only. Verify any portfolio changes with your broker.";
}

async function safeJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; detail: string }> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
  } catch (caught) {
    return {
      ok: false,
      detail:
        caught instanceof Error
          ? caught.message
          : "FiCo-Engine nicht erreichbar",
    };
  }
  if (!response.ok) {
    return { ok: false, detail: `HTTP ${response.status}` };
  }
  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, detail: "Ungültige JSON-Antwort" };
  }
}

/** Voice: cash-buffer waterfall instruction */
export async function evaluateWaterfallVoice(params: {
  fixedCostSumLookback: number;
  targetBufferMonths?: number;
  liquidChecking: number;
  liquidSavings?: number;
}): Promise<string> {
  const result = await safeJson<{
    instruction: string;
    rationale: string;
    targetEmergencyBuffer: string;
    currentLiquidReserve: string;
    deficit: string;
    surplus: string;
  }>("/v1/ledger/waterfall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fixedCostSumLookback: params.fixedCostSumLookback,
      targetBufferMonths: params.targetBufferMonths ?? 3,
      accounts: [
        { type: "CHECKING", balanceAmount: params.liquidChecking },
        {
          type: "SAVINGS",
          balanceAmount: params.liquidSavings ?? 0,
        },
      ],
    }),
  });
  if (!result.ok) {
    return `Waterfall nicht verfügbar: ${result.detail}`;
  }
  const d = result.data;
  return [
    `Empfehlung: ${d.instruction}.`,
    `Liquidität ${d.currentLiquidReserve} € bei Zielpuffer ${d.targetEmergencyBuffer} €`,
    d.deficit !== "0.00" ? `(Defizit ${d.deficit} €)` : `(Überschuss ${d.surplus} €).`,
    d.rationale,
  ].join(" ");
}

/** Voice: list Nettoprodukte from HonorarKonzept / con.fee */
export async function listNetTariffsVoice(params?: {
  provider?: "HONORARKONZEPT" | "CONFEE";
  line?: string;
  search?: string;
  limit?: number;
}): Promise<string> {
  const qs = new URLSearchParams();
  if (params?.provider) qs.set("provider", params.provider);
  if (params?.line) qs.set("line", params.line);
  if (params?.search) qs.set("search", params.search);
  qs.set("limit", String(params?.limit ?? 5));

  const result = await safeJson<{
    count: number;
    products: Array<{
      provider: string;
      productName: string;
      carrierName: string;
      line: string;
      id: string;
    }>;
  }>(`/v1/net-tariffs/products?${qs}`);

  if (!result.ok) return `Nettotarife nicht verfügbar: ${result.detail}`;
  if (!result.data.products.length) {
    return "Keine Nettoprodukte für diese Filter gefunden.";
  }
  const lines = result.data.products.map(
    (p, i) =>
      `${i + 1}. ${p.productName} (${p.carrierName}, ${p.provider}, ${p.line})`,
  );
  return `Gefunden ${result.data.count} Nettoprodukte: ${lines.join("; ")}. Vergleich und Antrag nur als Makro-/Deep-Link — keine Wertpapierempfehlung.`;
}

/** Voice: gross vs net advantage (explicit advisory fee) */
export async function compareNetTariffVoice(params: {
  provider?: "HONORARKONZEPT" | "CONFEE";
  grossAnnualCost: number;
  netAnnualCost: number;
  advisoryFeeAnnual: number;
  years?: number;
}): Promise<string> {
  const result = await safeJson<{
    annualProductSavings: number;
    annualNetOfAdvisory: number;
    npvSavings: number;
    breakEvenYears: number | null;
    feeType: string;
  }>("/v1/net-tariffs/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: params.provider ?? "CONFEE",
      grossAnnualCost: params.grossAnnualCost,
      netAnnualCost: params.netAnnualCost,
      advisoryFeeAnnual: params.advisoryFeeAnnual,
      years: params.years ?? 10,
    }),
  });
  if (!result.ok) return `Vergleich nicht verfügbar: ${result.detail}`;
  const d = result.data;
  return [
    `Jährliche Produkt-Ersparnis ${d.annualProductSavings.toFixed(0)} €`,
    `nach Honorar (${d.feeType}) noch ${d.annualNetOfAdvisory.toFixed(0)} €/Jahr`,
    `NPV über den Horizont ${d.npvSavings.toFixed(0)} €`,
    d.breakEvenYears != null ? `Break-even Jahr ${d.breakEvenYears}.` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

/** Voice: economic gate before finexpert / F&B */
export async function evaluatePolicyGateVoice(params: {
  policyType: string;
  subscriptionTier?: "FREE" | "ACTIVE_SUBSCRIBER";
}): Promise<string> {
  const result = await safeJson<{
    triggerStatus: string;
    action: string;
    callFinexpert: boolean;
    previewMessage?: string;
    reason?: string;
  }>("/v1/policy/economic-gate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      policyType: params.policyType,
      subscriptionTier: params.subscriptionTier ?? "FREE",
    }),
  });
  if (!result.ok) return `Policy-Gate nicht verfügbar: ${result.detail}`;
  const d = result.data;
  if (d.callFinexpert) {
    return `Policy-Gate: finexpert/F&B freigeschaltet (${d.triggerStatus}).`;
  }
  return [
    `Policy-Gate: ${d.triggerStatus} / ${d.action}.`,
    d.previewMessage ?? d.reason ?? "Kein externer Synopsen-Call.",
  ].join(" ");
}

/** Voice: search uploaded policy vault via retrieval */
export async function searchDocumentsVoice(
  userId: string,
  question: string,
): Promise<string> {
  const trimmed = question.trim();
  if (!trimmed) return "Bitte eine Frage zu den hochgeladenen Dokumenten stellen.";

  const result = await safeJson<{
    chunks: string[];
    searchable: boolean;
    reason?: string;
  }>("/v1/retrieval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, question: trimmed }),
  });
  if (!result.ok) return `Dokumentensuche nicht verfügbar: ${result.detail}`;
  if (!result.data.searchable) {
    return result.data.reason ?? "Dokumentensuche ist nicht konfiguriert.";
  }
  if (!result.data.chunks.length) {
    return "In den hochgeladenen Dokumenten dazu nichts gefunden.";
  }
  const snippet = result.data.chunks
    .slice(0, 3)
    .map((c) => c.replace(/\s+/g, " ").slice(0, 220))
    .join(" … ");
  return `Aus dem Dokumenten-Tresor: ${snippet}`;
}
