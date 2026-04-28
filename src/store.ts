import type { ConfidenceState, ScoringRecord } from "./types.js";

const TTL_MS = 60 * 60 * 1000; // evict records older than 1 hour

function recordKey(sessionKey: string, runId: string): string {
  return `${sessionKey}:${runId}`;
}

/**
 * SAME-PROCESS / NON-DURABLE / BEST-EFFORT.
 *
 * FtalStore is an in-memory singleton. It does not survive process restart,
 * is not shared across workers, and makes no persistence guarantees.
 * Records are evicted after 1 hour (TTL) or when deleteByRun() is called
 * at run completion. Downstream plugins should treat missing records as
 * "no score available" and degrade gracefully.
 *
 * Records contain only compact score metadata (rubric id, dimension scores,
 * gap, confidence). Raw reply text is never stored here.
 */
class FtalStoreImpl {
  private readonly records = new Map<string, ScoringRecord>();

  set(record: ScoringRecord): void {
    this.records.set(recordKey(record.sessionKey, record.runId), record);
    this.evict();
  }

  get(sessionKey: string, runId: string): ScoringRecord | undefined {
    return this.records.get(recordKey(sessionKey, runId));
  }

  // Returns the most recently scored record for a session — useful for P2 claim verification
  // which hooks after_tool_call and needs to know the preceding turn's score.
  getLatest(sessionKey: string): ScoringRecord | undefined {
    let latest: ScoringRecord | undefined;
    for (const record of this.records.values()) {
      if (record.sessionKey === sessionKey) {
        if (!latest || record.scoredAt > latest.scoredAt) {
          latest = record;
        }
      }
    }
    return latest;
  }

  // P2 calls this to flip confidence after independent claim verification.
  // Returns false if the record doesn't exist (P2 should tolerate this gracefully).
  updateConfidence(
    sessionKey: string,
    runId: string,
    state: ConfidenceState,
    memoryIds?: string[],
  ): boolean {
    const key = recordKey(sessionKey, runId);
    const existing = this.records.get(key);
    if (!existing) return false;
    this.records.set(key, {
      ...existing,
      confidence: state,
      memoryIds: memoryIds ?? existing.memoryIds,
    });
    return true;
  }

  // Call from agent_end to release a run's record immediately rather than waiting for TTL.
  // Plugins that hook agent_end can call this after reading the score.
  deleteByRun(sessionKey: string, runId: string): void {
    this.records.delete(recordKey(sessionKey, runId));
  }

  private evict(): void {
    const cutoff = Date.now() - TTL_MS;
    for (const [key, record] of this.records.entries()) {
      if (record.scoredAt < cutoff) this.records.delete(key);
    }
  }

  // Test helpers.
  _clear(): void {
    this.records.clear();
  }

  _size(): number {
    return this.records.size;
  }
}

// Module-level singleton. Other plugins import this directly:
//   import { FtalStore } from "openclaw-ftal/store";
export const FtalStore = new FtalStoreImpl();
