/**
 * Zero-cost local OCR heuristics — Step 1 of document gating.
 *
 * Full LayoutLMv3 / Textract pipeline is offloaded to worker pools.
 * This module only classifies document type before any paid API call.
 */

import type { PolicyType } from "./economic-gate.js";

export interface OcrHeuristicInput {
  /** Extracted plain text from first N pages (local Tesseract / pdf-text) */
  textSample: string;
  pageCount: number;
  /** Uncompressed bitmap estimate in MB (spec: 80–150 MB / doc at 300 DPI) */
  estimatedBitmapMb?: number;
}

export interface OcrHeuristicResult {
  documentKind: "INSURANCE_POLICY" | "NON_INSURANCE" | "AMBIGUOUS";
  guessedPolicyType: PolicyType;
  confidence: number;
}

const INSURANCE_KEYWORDS =
  /\b(versicherung|police|versicherungsschein|beitrag|prämie|versicherungsnehmer|versicherer|bedingungen|AVB|BU-Rente|Berufsunfähigkeit|Lebensversicherung|Krankenversicherung)\b/i;

const NON_INSURANCE_KEYWORDS =
  /\b(rechnung|invoice|fahrzeugschein|leasingvertrag|mietvertrag|stromrechnung|mobilfunk|telefonrechnung|gehaltsabrechnung)\b/i;

const TYPE_HINTS: Array<{ re: RegExp; type: PolicyType }> = [
  { re: /Berufsunfähigkeit|\bBU[- ]/i, type: "BU_DISABILITY" },
  { re: /Lebensversicherung|Risikoleben|Term Life/i, type: "TERM_LIFE" },
  { re: /Private\s*Kranken|PKV/i, type: "PRIVATE_HEALTH" },
  { re: /Rentenversicherung|Basisrente|Rürup/i, type: "PENSION_BASE" },
  { re: /private\s*Rente|Privatrente/i, type: "PENSION_PRIVATE" },
  { re: /bAV|betriebliche\s*Alters/i, type: "PENSION_OCCUPATIONAL" },
  { re: /Hausrat|Haftpflicht|Wohngebäude|Kfz[- ]Versicher/i, type: "PROPERTY_CASUALTY" },
  { re: /Rechtsschutz/i, type: "LEGAL_PROTECTION" },
  { re: /Tierkranken|Hund|Katze.*Versicher/i, type: "PET_HEALTH" },
];

/** Concurrency cap: floor(Available_RAM / 256MB) */
export function maxDocumentConcurrency(availableRamMb: number): number {
  return Math.max(1, Math.floor(availableRamMb / 256));
}

export function classifyDocumentHeuristically(
  input: OcrHeuristicInput,
): OcrHeuristicResult {
  if (NON_INSURANCE_KEYWORDS.test(input.textSample) && !INSURANCE_KEYWORDS.test(input.textSample)) {
    return {
      documentKind: "NON_INSURANCE",
      guessedPolicyType: "UNKNOWN_NON_INSURANCE",
      confidence: 0.85,
    };
  }

  if (!INSURANCE_KEYWORDS.test(input.textSample)) {
    return {
      documentKind: "AMBIGUOUS",
      guessedPolicyType: "UNKNOWN_NON_INSURANCE",
      confidence: 0.4,
    };
  }

  for (const hint of TYPE_HINTS) {
    if (hint.re.test(input.textSample)) {
      return {
        documentKind: "INSURANCE_POLICY",
        guessedPolicyType: hint.type,
        confidence: 0.75,
      };
    }
  }

  return {
    documentKind: "INSURANCE_POLICY",
    guessedPolicyType: "PROPERTY_CASUALTY",
    confidence: 0.55,
  };
}

export interface ExtractedPolicyEntities {
  carrier?: string;
  tariffCode?: string;
  premium?: number;
  startDate?: string;
  insuredSum?: number;
  policyType: PolicyType;
}

/**
 * Scaffold for multi-modal OCR pipeline output contract.
 * Real implementation lives in DocumentIngestionWorker (CUDA/SIMD offload).
 */
export async function parsePolicyDocumentScaffold(
  input: OcrHeuristicInput,
): Promise<ExtractedPolicyEntities> {
  const heuristic = classifyDocumentHeuristically(input);
  return {
    policyType: heuristic.guessedPolicyType,
  };
}
