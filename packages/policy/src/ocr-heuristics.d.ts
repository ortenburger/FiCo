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
/** Concurrency cap: floor(Available_RAM / 256MB) */
export declare function maxDocumentConcurrency(availableRamMb: number): number;
export declare function classifyDocumentHeuristically(input: OcrHeuristicInput): OcrHeuristicResult;
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
export declare function parsePolicyDocumentScaffold(input: OcrHeuristicInput): Promise<ExtractedPolicyEntities>;
//# sourceMappingURL=ocr-heuristics.d.ts.map