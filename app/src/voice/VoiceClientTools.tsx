import { useConversationClientTool, type ClientTools } from "@elevenlabs/react";
import {
  askCopilot,
  listDocuments,
  readDocument,
  compareNetTariffVoice,
  evaluatePolicyGateVoice,
  evaluateWaterfallVoice,
  listNetTariffsVoice,
  postProfileField,
  searchDocumentsVoice,
  type ProfileField,
  type ReadDocumentParams,
} from "./api";

export type ProfileUiState = Record<ProfileField, string | null>;

type DocumentToolParams = {
  policyId?: string;
  document?: string;
  page?: number | string;
  pageFrom?: number | string;
  pageTo?: number | string;
  query?: string;
};

type FicoVoiceTools = ClientTools & {
  set_profile_field: (params: { field: ProfileField; value: string }) => string;
  ask_copilot: (params: { question: string }) => string;
  list_documents: (params: Record<string, never>) => string;
  read_document: (params: DocumentToolParams) => string;
  evaluate_waterfall: (params: {
    fixed_cost_sum_90d: number | string;
    liquid_checking: number | string;
    liquid_savings?: number | string;
    target_buffer_months?: number | string;
  }) => string;
  list_net_tariffs: (params: {
    provider?: "HONORARKONZEPT" | "CONFEE" | string;
    line?: string;
    search?: string;
  }) => string;
  compare_net_tariff: (params: {
    provider?: "HONORARKONZEPT" | "CONFEE" | string;
    gross_annual_cost: number | string;
    net_annual_cost: number | string;
    advisory_fee_annual: number | string;
    years?: number | string;
  }) => string;
  evaluate_policy_gate: (params: {
    policy_type: string;
    subscription_tier?: "FREE" | "ACTIVE_SUBSCRIBER" | string;
  }) => string;
  search_documents: (params: { question: string }) => string;
};

function optionalNumber(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeReadParams(params: DocumentToolParams): ReadDocumentParams {
  return {
    policyId: params.policyId?.trim() || undefined,
    document: params.document?.trim() || undefined,
    page: optionalNumber(params.page),
    pageFrom: optionalNumber(params.pageFrom),
    pageTo: optionalNumber(params.pageTo),
    query: params.query?.trim() || undefined,
  };
}

type VoiceClientToolsProps = {
  userId: string;
  onProfileField: (field: ProfileField, value: string) => void;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value == null || value === "") return fallback;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function VoiceClientTools({
  userId,
  onProfileField,
}: VoiceClientToolsProps) {
  useConversationClientTool<FicoVoiceTools>(
    "set_profile_field",
    async ({ field, value }) => {
      const normalizedField = field;
      if (normalizedField !== "salary" && normalizedField !== "marital_status") {
        return `Unbekanntes Profilfeld „${String(field)}“. Erlaubt: salary, marital_status.`;
      }

      const normalizedValue = String(value ?? "").trim();
      if (!normalizedValue) {
        return `Kein Wert für ${normalizedField} angegeben.`;
      }

      const result = await postProfileField(
        normalizedField,
        normalizedValue,
        userId,
      );
      if (result.ok) {
        onProfileField(normalizedField, normalizedValue);
        return `${normalizedField} wurde gespeichert.`;
      }
      if (result.reason === "invalid") {
        return `„${result.detail}" konnte nicht als ${normalizedField} gelesen werden. Bitte anders formulieren.`;
      }
      if (result.reason === "network") {
        return `${normalizedField} konnte nicht gespeichert werden: die FiCo-Engine ist nicht erreichbar.`;
      }
      return `${normalizedField} konnte nicht gespeichert werden (${result.detail ?? "Serverfehler"}).`;
    },
  );

  useConversationClientTool<FicoVoiceTools>("ask_copilot", async ({ question }) => {
    return askCopilot(String(question ?? ""));
  });

  useConversationClientTool<FicoVoiceTools>("list_documents", async () => {
    const result = await listDocuments(userId);
    if (!result.ok) return `Dokumentliste nicht verfügbar: ${result.message}`;
    if (result.kind !== "list") return "Unerwartete Antwort der Dokument-API.";
    if (result.documents.length === 0) {
      return "Im Tresor liegt noch kein Dokument. Bitte lade zuerst eine Police als PDF hoch.";
    }

    const lines = result.documents.map((doc, index) => {
      const number = `${index + 1}.`;
      const name = doc.fileName ?? "Dokument";
      const policyNumber = doc.policyNumber
        ? `, Policennummer ${doc.policyNumber}`
        : "";
      return `${number} ${name} (${doc.providerName}${policyNumber}, Status ${doc.documentStatus}) — policyId: ${doc.policyId}`;
    });

    return [
      `Im Tresor liegen ${result.documents.length} Dokument(e):`,
      ...lines,
      result.hint,
    ].join("\n");
  });

  useConversationClientTool<FicoVoiceTools>(
    "read_document",
    async (params) => {
      const result = await readDocument(userId, normalizeReadParams(params));
      if (!result.ok) return `Dokument konnte nicht gelesen werden: ${result.message}`;
      if (result.kind === "list") return "Unerwartete Antwort der Dokument-API.";

      const document = result.document;
      const header = [
        `Dokument: ${document.fileName ?? "Dokument"}`,
        document.providerName,
        document.policyNumber ? `Police ${document.policyNumber}` : null,
        `${document.pageCount} Seiten`,
      ]
        .filter(Boolean)
        .join(" · ");

      if (result.kind === "matches") {
        if (result.matches.length === 0) {
          return `${header}\nKein Treffer für „${result.query}". ${result.hint}`;
        }
        const lines = result.matches.map(
          (match) => `[Seite ${match.page}] ${match.snippet}`,
        );
        return [
          header,
          `Treffer für „${result.query}" auf ${result.matches.length} Seite(n):`,
          ...lines,
          result.hint,
        ].join("\n");
      }

      const pageBlocks = result.pages.map((page) => {
        const text =
          page.text.trim().length > 0
            ? page.text
            : "(kein Text auf dieser Seite — vermutlich ein Scan)";
        return `[Seite ${page.page}]\n${text}`;
      });

      return [
        header,
        `Gelesene Seiten: ${result.firstPage} bis ${result.lastPage}.`,
        ...pageBlocks,
        result.hint,
      ].join("\n\n");
    },
  );

  useConversationClientTool<FicoVoiceTools>(
    "evaluate_waterfall",
    async ({
      fixed_cost_sum_90d,
      liquid_checking,
      liquid_savings,
      target_buffer_months,
    }) => {
      return evaluateWaterfallVoice({
        fixedCostSumLookback: asNumber(fixed_cost_sum_90d),
        liquidChecking: asNumber(liquid_checking),
        liquidSavings: asNumber(liquid_savings, 0),
        targetBufferMonths: asNumber(target_buffer_months, 3),
      });
    },
  );

  useConversationClientTool<FicoVoiceTools>(
    "list_net_tariffs",
    async ({ provider, line, search }) => {
      const normalized =
        provider === "HONORARKONZEPT" || provider === "CONFEE"
          ? provider
          : undefined;
      return listNetTariffsVoice({
        provider: normalized,
        line: line ? String(line) : undefined,
        search: search ? String(search) : undefined,
        limit: 5,
      });
    },
  );

  useConversationClientTool<FicoVoiceTools>(
    "compare_net_tariff",
    async ({
      provider,
      gross_annual_cost,
      net_annual_cost,
      advisory_fee_annual,
      years,
    }) => {
      const normalized =
        provider === "HONORARKONZEPT" || provider === "CONFEE"
          ? provider
          : "CONFEE";
      return compareNetTariffVoice({
        provider: normalized,
        grossAnnualCost: asNumber(gross_annual_cost),
        netAnnualCost: asNumber(net_annual_cost),
        advisoryFeeAnnual: asNumber(advisory_fee_annual),
        years: asNumber(years, 10),
      });
    },
  );

  useConversationClientTool<FicoVoiceTools>(
    "evaluate_policy_gate",
    async ({ policy_type, subscription_tier }) => {
      const tier =
        subscription_tier === "ACTIVE_SUBSCRIBER" ? "ACTIVE_SUBSCRIBER" : "FREE";
      return evaluatePolicyGateVoice({
        policyType: String(policy_type ?? "UNKNOWN_NON_INSURANCE"),
        subscriptionTier: tier,
      });
    },
  );

  useConversationClientTool<FicoVoiceTools>(
    "search_documents",
    async ({ question }) => {
      return searchDocumentsVoice(userId, String(question ?? ""));
    },
  );

  return null;
}
