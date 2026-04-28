import { describe, it, expect, beforeEach } from "vitest";
import {
  attachTeachingContext,
  storePendingTeaching,
  clearPendingTeaching,
} from "./before-prompt-build.js";
import type { TeachingContext } from "../types.js";

const sampleTeaching: TeachingContext = {
  sessionKey: "session-1",
  rubric: "coding-ftal-v1",
  gap: 45,
  dimensions: { F: 55, T: 60, A: 70, L: 100 },
  suggestedContext: "Improve faithfulness.",
};

beforeEach(() => {
  clearPendingTeaching("session-1");
});

describe("attachTeachingContext", () => {
  it("returns void when no teaching is pending", () => {
    const result = attachTeachingContext({}, { sessionKey: "session-1" });
    expect(result).toBeUndefined();
  });

  it("returns void when sessionKey is missing", () => {
    storePendingTeaching(sampleTeaching);
    const result = attachTeachingContext({}, {});
    expect(result).toBeUndefined();
  });

  it("returns prependContext when a teaching is pending", () => {
    storePendingTeaching(sampleTeaching);
    const result = attachTeachingContext({}, { sessionKey: "session-1" });
    expect(result).toBeDefined();
    expect(result!.prependContext).toContain("gap=45");
    expect(result!.prependContext).toContain("coding-ftal-v1");
    expect(result!.prependContext).toContain("F: 55");
  });

  it("clears the teaching after one use", () => {
    storePendingTeaching(sampleTeaching);
    attachTeachingContext({}, { sessionKey: "session-1" });
    const second = attachTeachingContext({}, { sessionKey: "session-1" });
    expect(second).toBeUndefined();
  });
});
