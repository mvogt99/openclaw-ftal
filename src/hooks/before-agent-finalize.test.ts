import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBeforeAgentFinalizeHandler, _resetRevisionCounts } from "./before-agent-finalize.js";
import { FtalStore } from "../store.js";
import { storePendingTeaching } from "./before-prompt-build.js";
import type { Rubric } from "../types.js";

vi.mock("./before-prompt-build.js", () => ({
  storePendingTeaching: vi.fn(),
}));

const baseEvent = {
  sessionId: "sess-1",
  sessionKey: "sess-1",
  runId: "run-1",
  stopHookActive: false,
  lastAssistantMessage: "This is a reply.",
};

function makeRubric(scores: Record<string, number>, threshold = 30): Rubric {
  return {
    id: "coding-ftal-v1",
    gapThreshold: threshold,
    dimensions: [
      { key: "F", weight: 40 },
      { key: "T", weight: 40 },
      { key: "A", weight: 10 },
      { key: "L", weight: 10 },
    ],
    async score() {
      return scores;
    },
  };
}

describe("createBeforeAgentFinalizeHandler", () => {
  beforeEach(() => {
    _resetRevisionCounts();
    FtalStore._clear();
    vi.mocked(storePendingTeaching).mockClear();
  });

  it("returns continue when reply passes rubric", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 90, T: 90, A: 90, L: 90 }), 3, true);
    const result = await handler(baseEvent);
    expect(result?.action).toBe("continue");
  });

  it("returns revise when reply fails rubric and retryEnabled and under max", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, true);
    const result = await handler(baseEvent);
    expect(result?.action).toBe("revise");
    expect(result?.reason).toContain("gap=");
  });

  it("returns continue (not revise) when max revisions reached", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 2, true);
    await handler(baseEvent);
    await handler(baseEvent);
    const third = await handler(baseEvent);
    expect(third?.action).toBe("continue");
  });

  it("returns continue when lastAssistantMessage is undefined", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, true);
    const result = await handler({ ...baseEvent, lastAssistantMessage: undefined });
    expect(result?.action).toBe("continue");
  });

  it("does not return revise when retryEnabled is false", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, false);
    const result = await handler(baseEvent);
    expect(result?.action).toBe("continue");
  });

  it("calls storePendingTeaching when returning revise", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, true);
    await handler(baseEvent);
    expect(storePendingTeaching).toHaveBeenCalledOnce();
  });

  it("does not call storePendingTeaching when reply passes", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 90, T: 90, A: 90, L: 90 }), 3, true);
    await handler(baseEvent);
    expect(storePendingTeaching).not.toHaveBeenCalled();
  });

  it("writes to FtalStore on pass", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 90, T: 90, A: 90, L: 90 }), 3, true);
    await handler(baseEvent);
    const record = FtalStore.get("sess-1", "run-1");
    expect(record).toBeDefined();
    expect(record?.passed).toBe(true);
  });

  it("writes to FtalStore on revise", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, true);
    await handler(baseEvent);
    const record = FtalStore.get("sess-1", "run-1");
    expect(record).toBeDefined();
    expect(record?.passed).toBe(false);
  });

  it("falls back to sessionId when sessionKey is absent", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 90, T: 90, A: 90, L: 90 }), 3, true);
    const event = { sessionId: "sid-only", runId: "run-1", stopHookActive: false, lastAssistantMessage: "hi" };
    await handler(event);
    const record = FtalStore.get("sid-only", "run-1");
    expect(record).toBeDefined();
  });

  it("returns continue when runId and turnId are both absent", async () => {
    const handler = createBeforeAgentFinalizeHandler(makeRubric({ F: 40, T: 40, A: 40, L: 40 }), 3, true);
    const event = { sessionId: "sess-1", stopHookActive: false, lastAssistantMessage: "hi" };
    const result = await handler(event);
    expect(result?.action).toBe("continue");
  });

  it("resets revision count after passing", async () => {
    const failRubric = makeRubric({ F: 40, T: 40, A: 40, L: 40 });
    const passRubric = makeRubric({ F: 90, T: 90, A: 90, L: 90 });
    const failHandler = createBeforeAgentFinalizeHandler(failRubric, 2, true);
    const passHandler = createBeforeAgentFinalizeHandler(passRubric, 2, true);

    // Use up 1 of 2 revisions
    await failHandler(baseEvent);
    // Pass clears the counter
    await passHandler(baseEvent);
    // Should get 2 fresh revisions
    const r1 = await failHandler(baseEvent);
    const r2 = await failHandler(baseEvent);
    const r3 = await failHandler(baseEvent); // exceeded again
    expect(r1?.action).toBe("revise");
    expect(r2?.action).toBe("revise");
    expect(r3?.action).toBe("continue");
  });
});
