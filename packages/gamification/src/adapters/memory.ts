import type { GamificationStore } from "../store.js";
import type { AwardJournalEntry, GamificationProfileData } from "../types.js";

/**
 * In-memory GamificationStore — used by tests and offline demos so the engine
 * can run without a Postgres connection or generated Prisma client.
 */
export class InMemoryStore implements GamificationStore {
  readonly profiles = new Map<string, GamificationProfileData>();
  readonly awards: AwardJournalEntry[] = [];

  async loadProfile(userId: string): Promise<GamificationProfileData | null> {
    return structuredClone(this.profiles.get(userId) ?? null) ?? null;
  }

  async saveProfile(
    userId: string,
    profile: GamificationProfileData,
  ): Promise<GamificationProfileData> {
    const stored: GamificationProfileData = structuredClone(profile);
    this.profiles.set(userId, stored);
    return structuredClone(stored);
  }

  async hasAward(userId: string, eventId: string): Promise<boolean> {
    return this.awards.some(
      (entry) => entry.userId === userId && entry.eventId === eventId,
    );
  }

  async recordAward(entry: AwardJournalEntry): Promise<void> {
    this.awards.push({ ...structuredClone(entry) });
  }
}
