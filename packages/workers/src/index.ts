import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { classifyTransactions, type RawTx } from "@fico/aisp";
import {
  classifyDocumentHeuristically,
  evaluateEconomicGate,
  FinexpertClient,
  maxDocumentConcurrency,
} from "@fico/policy";
import { ingestDocumentChunks } from "./ingest-document-chunks.js";

/**
 * Background workers — ALL external HTTP lives here.
 * Invariant: zero external network calls inside DB transaction blocks.
 */

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  maxRetriesPerRequest: null,
};

export const ingestionQueue = new Queue("aisp-ingestion", { connection });
export const documentQueue = new Queue("document-ingestion", { connection });
export const synopsisQueue = new Queue("finexpert-synopsis", { connection });

const docConcurrency = maxDocumentConcurrency(
  Number(process.env.WORKER_RAM_MB ?? 1024),
);

new Worker(
  "aisp-ingestion",
  async (job) => {
    // Raw payloads arrive from Redis/BullMQ — classify then persist asynchronously.
    const txs = job.data.transactions as RawTx[];
    const classified = classifyTransactions(txs);
    return {
      classifiedCount: classified.length,
      insurancePremiums: classified.filter(
        (t) => t.subCategory === "INSURANCE_PREMIUM",
      ).length,
    };
  },
  { connection, concurrency: 4 },
);

new Worker(
  "document-ingestion",
  async (job) => {
    const textSample = String(job.data.textSample ?? "");
    const pageCount = Number(job.data.pageCount ?? 1);
    const heuristic = classifyDocumentHeuristically({ textSample, pageCount });

    if (heuristic.documentKind === "NON_INSURANCE") {
      return { triggerStatus: "REJECTED", heuristic };
    }

    const gate = evaluateEconomicGate({
      policyType: heuristic.guessedPolicyType,
      subscriptionTier: job.data.subscriptionTier ?? "FREE",
    });

    if (gate.callFinexpert) {
      await synopsisQueue.add("synopsis", {
        policyId: job.data.policyId,
        heuristic,
      });
    }

    let ragIngest:
      | Awaited<ReturnType<typeof ingestDocumentChunks>>
      | undefined;
    if (gate.triggerStatus !== "REJECTED") {
      ragIngest = await ingestDocumentChunks({
        userId: String(job.data.userId ?? ""),
        policyId: String(job.data.policyId ?? ""),
        rawDocumentS3Key: String(job.data.rawDocumentS3Key ?? ""),
        fallbackText: textSample,
      });
    }

    return { gate, heuristic, ragIngest };
  },
  { connection, concurrency: docConcurrency },
);

new Worker(
  "finexpert-synopsis",
  async (job) => {
    const client = new FinexpertClient({
      baseUrl: process.env.FINEXPERT_BASE_URL ?? "https://api.finexpert.example/api/v1",
      clientId: process.env.FINEXPERT_CLIENT_ID ?? "",
      clientSecret: process.env.FINEXPERT_CLIENT_SECRET ?? "",
    });

    // Detached worker only — p99 upstream latency must not block API pods.
    const synopsis = await client.createSynopsis({
      source_tariff: job.data.source_tariff,
      target_tariffs: job.data.target_tariffs ?? [],
      criteria_profile:
        job.data.criteria_profile ?? "VERBRAUCHERSCHUTZ_STANDARD",
    });

    return { policyId: job.data.policyId, synopsis };
  },
  { connection, concurrency: 2 },
);

console.log(
  `FiCo workers online (doc concurrency=${docConcurrency}). Queues: aisp-ingestion, document-ingestion, finexpert-synopsis`,
);
