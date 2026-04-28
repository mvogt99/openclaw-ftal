import { describe, it, expect, vi } from "vitest";
import { extractLastAssistantText, computeGap, createAgentEndHandler } from "./agent-end.js";
import type { Rubric } from "../types.js";

// --- extractLastAssistantText ---

describe("extractLastAssistantText", () => {
  it("returns undefined for empty messages", () => {
    expect(extractLastAssistantText([])).toBeUndefined();
  });

  it("extracts string content from last assistant message", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "assistant", content: "the answer" },
    ];
    expect(extractLastAssistantText(messages)).toBe("the answer");
  });

  it("extracts text from content block array", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      },
    ];
    expect(extractLastAssistantText(messages)).toBe("hello world");
  });

  it("returns undefined when there are no assistant messages", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "user", content: "follow-up" },
    ];
    expect(extractLastAssistantText(messages)).toBeUndefined();
  });

  it("returns last assistant message even when a user message follows it", () => {
    const messages = [
      { role: "assistant", content: "first" },
      { role: "user", content: "follow-up" },
    ];
    expect(extractLastAssistantText(messages)).toBe("first");
  });
});

// --- computeGap ---

const ftalRubric: Rubric = {
  id: "coding-ftal-v1",
  gapThreshold: 30,
  dimensions: [
    { key: "F", weight: 40 },
    { key: "T", weight: 40 },
    { key: "A", weight: 10 },
    { key: "L", weight: 10 },
  ],
  async score() {
    return {};
  },
};

describe("computeGap", () => {
  it("returns 0 for perfect scores", () => {
    expect(computeGap({ F: 100, T: 100, A: 100, L: 100 }, ftalRubric)).toBe(0);
  });

  it("returns 100 for zero scores", () => {
    expect(computeGap({ F: 0, T: 0, A: 0, L: 0 }, ftalRubric)).toBe(100);
  });

  it("computes weighted gap correctly", () => {
    // weighted avg = (80*40 + 80*40 + 80*10 + 80*10) / 100 = 80, gap = 20
    const gap = computeGap({ F: 80, T: 80, A: 80, L: 80 }, ftalRubric);
    expect(gap).toBeCloseTo(20);
  });

  it("uses missing dimension score as 0", () => {
    const gap = computeGap({ F: 100, T: 100 }, ftalRubric);
    // weighted = (100*40 + 100*40 + 0*10 + 0*10) / 100 = 80, gap = 20
    expect(gap).toBeCloseTo(20);
  });
});

// --- createAgentEndHandler ---

function makeRubric(scores: Record<string, number>): Rubric {
  return {
    ...ftalRubric,
    async score() {
      return scores;
    },
  };
}

describe("createAgentEndHandler", () => {
  it("emits a ScoringEvent on success", async () => {
    const emit = vi.fn();
    const rubric = makeRubric({ F: 90, T: 90, A: 90, L: 90 });
    const handler = createAgentEndHandler(rubric, emit, false);

    await handler(
      {
        messages: [{ role: "assistant", content: "great answer" }],
        success: true,
      },
      { sessionKey: "s1", runId: "r1" },
    );

    expect(emit).toHaveBeenCalledOnce();
    const [event, sessionKey, runId] = emit.mock.calls[0]!;
    expect(event.rubric).toBe("coding-ftal-v1");
    expect(event.passed).toBe(true);
    expect(event.confidence).toBe("provisional");
    expect(sessionKey).toBe("s1");
    expect(runId).toBe("r1");
  });

  it("does not emit when success is false", async () => {
    const emit = vi.fn();
    const rubric = makeRubric({ F: 90, T: 90, A: 90, L: 90 });
    const handler = createAgentEndHandler(rubric, emit, false);

    await handler(
      { messages: [{ role: "assistant", content: "answer" }], success: false },
      { sessionKey: "s1", runId: "r1" },
    );

    expect(emit).not.toHaveBeenCalled();
  });

  it("does not emit when no assistant message found", async () => {
    const emit = vi.fn();
    const rubric = makeRubric({ F: 90, T: 90, A: 90, L: 90 });
    const handler = createAgentEndHandler(rubric, emit, false);

    await handler(
      { messages: [{ role: "user", content: "question" }], success: true },
      { sessionKey: "s1", runId: "r1" },
    );

    expect(emit).not.toHaveBeenCalled();
  });

  it("does not emit when sessionKey or runId is missing", async () => {
    const emit = vi.fn();
    const rubric = makeRubric({ F: 90, T: 90, A: 90, L: 90 });
    const handler = createAgentEndHandler(rubric, emit, false);

    await handler(
      { messages: [{ role: "assistant", content: "answer" }], success: true },
      { sessionKey: "s1" }, // runId missing
    );

    expect(emit).not.toHaveBeenCalled();
  });

  it("marks event as not passed when gap >= threshold", async () => {
    const emit = vi.fn();
    const rubric = makeRubric({ F: 40, T: 40, A: 40, L: 40 });
    const handler = createAgentEndHandler(rubric, emit, false);

    await handler(
      { messages: [{ role: "assistant", content: "weak answer" }], success: true },
      { sessionKey: "s1", runId: "r1" },
    );

    const [event] = emit.mock.calls[0]!;
    expect(event.passed).toBe(false);
    expect(event.gap).toBeGreaterThanOrEqual(30);
  });
});
