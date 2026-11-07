import type { AwardJournalEntry, GamificationProfileData } from "./types.js";

/**
 * Storage seam for the gamification engine. Backed by Prisma in production
 * (adapters/prisma.ts) and by an in-memory map in tests/offline demos
 * (adapters/memory.ts).
 */
export interface GamificationStore {
  /** Returns null when the user has no gamification profile yet. */
  loadProfile(userId: string): Promise<GamificationProfileData | null>;

  /** Full upsert of the profile state for a user. */
  saveProfile(userId: string, profile: GamificationProfileData): Promise<GamificationProfileData>;

  /** True when an award with this eventId was already journaled for the user. */
  hasAward(userId: string, eventId: string): Promise<boolean>;

  /** Appends to the award journal (source of truth for idempotency). */
  recordAward(entry: AwardJournalEntry): Promise<void>;
}
