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
