import { describe, it, expect, beforeEach } from "vitest";
import { FtalStore } from "./store.js";
import type { ScoringRecord } from "./types.js";

function makeRecord(
  overrides: Partial<ScoringRecord> = {},
): ScoringRecord {
  return {
    rubric: "ftal-v1",
    dimensions: { F: 80, T: 75, A: 90, L: 95 },
    gap: 20,
    passed: true,
    confidence: "provisional",
    sessionKey: "sess-1",
    runId: "run-1",
    scoredAt: Date.now(),
    ...overrides,
  };
}

describe("FtalStore", () => {
  beforeEach(() => FtalStore._clear());

  it("stores and retrieves a record by sessionKey+runId", () => {
    const rec = makeRecord();
    FtalStore.set(rec);
    expect(FtalStore.get("sess-1", "run-1")).toEqual(rec);
  });

  it("returns undefined for a missing key", () => {
    expect(FtalStore.get("sess-x", "run-x")).toBeUndefined();
  });

  it("getLatest returns the most recent record for a session", () => {
    const now = Date.now();
    const older = makeRecord({ runId: "run-1", scoredAt: now - 2000 });
    const newer = makeRecord({ runId: "run-2", scoredAt: now - 1000 });
    FtalStore.set(older);
    FtalStore.set(newer);
    expect(FtalStore.getLatest("sess-1")?.runId).toBe("run-2");
  });

  it("getLatest returns undefined if no records for session", () => {
    expect(FtalStore.getLatest("sess-none")).toBeUndefined();
  });

  it("getLatest is scoped to the requested session", () => {
    const now = Date.now();
    FtalStore.set(makeRecord({ sessionKey: "sess-1", runId: "run-1", scoredAt: now - 2000 }));
    FtalStore.set(makeRecord({ sessionKey: "sess-2", runId: "run-2", scoredAt: now - 1000 }));
    expect(FtalStore.getLatest("sess-2")?.runId).toBe("run-2");
  });

  it("updateConfidence flips confidence state", () => {
    FtalStore.set(makeRecord({ confidence: "provisional" }));
    const ok = FtalStore.updateConfidence("sess-1", "run-1", "verified");
    expect(ok).toBe(true);
    expect(FtalStore.get("sess-1", "run-1")?.confidence).toBe("verified");
  });

  it("updateConfidence attaches memoryIds", () => {
    FtalStore.set(makeRecord());
    FtalStore.updateConfidence("sess-1", "run-1", "verified", ["mem-abc"]);
    expect(FtalStore.get("sess-1", "run-1")?.memoryIds).toEqual(["mem-abc"]);
  });

  it("updateConfidence returns false for unknown record", () => {
    expect(FtalStore.updateConfidence("sess-x", "run-x", "verified")).toBe(false);
  });

  it("evicts records older than 1 hour on set", () => {
    const stale = makeRecord({
      runId: "run-stale",
      scoredAt: Date.now() - 61 * 60 * 1000,
    });
    FtalStore.set(stale);
    // set() triggers eviction; stale record should be gone
    FtalStore.set(makeRecord({ runId: "run-fresh" }));
    expect(FtalStore.get("sess-1", "run-stale")).toBeUndefined();
    expect(FtalStore._size()).toBe(1);
  });

  it("later set wins for same sessionKey+runId", () => {
    FtalStore.set(makeRecord({ gap: 30 }));
    FtalStore.set(makeRecord({ gap: 10 }));
    expect(FtalStore.get("sess-1", "run-1")?.gap).toBe(10);
  });
});
