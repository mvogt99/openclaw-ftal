import type { Rubric, ScoringEvent, ScoringRecord, TeachingContext } from "../types.js";
import { FtalStore } from "../store.js";
import { storePendingTeaching } from "./before-prompt-build.js";
import { computeGap } from "./agent-end.js";

type BeforeAgentFinalizeEvent = {
  runId?: string;
  sessionId: string;
  sessionKey?: string;
  turnId?: string;
  stopHookActive: boolean;
  lastAssistantMessage?: string;
  messages?: unknown[];
};

type BeforeAgentFinalizeResult = {
  action?: "continue" | "revise" | "finalize";
  reason?: string;
};

// Tracks revision count per runId within a process lifetime.
// Entries are deleted when we decide "continue" (passed or exhausted), so the Map stays small.
const revisionCounts = new Map<string, number>();

export function createBeforeAgentFinalizeHandler(
  rubric: Rubric,
  maxRevisions: number,
  retryEnabled: boolean,
) {
  return async function handleBeforeAgentFinalize(
    event: BeforeAgentFinalizeEvent,
  ): Promise<BeforeAgentFinalizeResult | void> {
    // Can't score without reply text — let the turn through unmodified.
    if (!event.lastAssistantMessage) return { action: "continue" };

    // Need at least one identity key to store the record meaningfully.
    const sessionKey = event.sessionKey ?? event.sessionId;
    const runId = event.runId ?? event.turnId;
    if (!runId) return { action: "continue" };

    const dimensions = await rubric.score(event.lastAssistantMessage, { sessionKey, runId });
    const gap = computeGap(dimensions, rubric);
    const passed = gap < rubric.gapThreshold;

    const scoringEvent: ScoringEvent = {
      rubric: rubric.id,
      dimensions,
      gap,
      passed,
      confidence: "provisional",
      sessionKey,
      runId,
    };

    const record: ScoringRecord = { ...scoringEvent, sessionKey, runId, scoredAt: Date.now() };
    FtalStore.set(record);

    if (passed || !retryEnabled) {
      revisionCounts.delete(runId);
      return { action: "continue" };
    }

    const count = (revisionCounts.get(runId) ?? 0) + 1;

    if (count > maxRevisions) {
      // Exhausted — let it through and clean up.
      revisionCounts.delete(runId);
      return { action: "continue" };
    }

    revisionCounts.set(runId, count);

    const dimLines = Object.entries(dimensions)
      .map(([k, v]) => `  ${k}: ${v.toFixed(0)}/100`)
      .join("\n");

    const weakDims = Object.entries(dimensions)
      .filter(([, v]) => v < 70)
      .map(([k]) => k)
      .join(", ");

    // reason is what the revising harness sees immediately (Stop hook / Codex relay).
    // before_prompt_build may not fire between the revision block and the continued pass,
    // so the actionable teaching must live here — not only in the queued context below.
    const reason = [
      `[FTAL revision ${count}/${maxRevisions} — rubric: ${rubric.id}, gap=${gap.toFixed(0)}, threshold=${rubric.gapThreshold}]`,
      `Dimension scores:\n${dimLines}`,
      weakDims
        ? `Weak dimensions: ${weakDims}. Please revise your reply to directly address these.`
        : "All dimensions scored above threshold — recheck faithfulness and factual accuracy.",
    ].join("\n");

    // Also queue teaching for the next OpenClaw-managed turn (before_prompt_build path).
    // Belt-and-suspenders: fires when the host manages the retry itself.
    const teaching: TeachingContext = {
      sessionKey,
      rubric: rubric.id,
      gap,
      dimensions,
      suggestedContext: reason,
    };
    storePendingTeaching(teaching);

    return { action: "revise", reason };
  };
}

// Exported for tests that need to reset state between cases.
export function _resetRevisionCounts(): void {
  revisionCounts.clear();
}
