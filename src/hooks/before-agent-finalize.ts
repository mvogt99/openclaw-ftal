import type { Rubric, ScoringEvent, ScoringRecord, TeachingContext } from "../types.js";
import { FtalStore } from "../store.js";
import { storePendingTeaching } from "./before-prompt-build.js";
import { computeGap, computeGatingGap } from "./agent-end.js";

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

    // Full gap (all dimensions) for reporting and FtalStore.
    const gap = computeGap(dimensions, rubric);
    // Gating gap excludes advisory dimensions (e.g. L/Latency) — retrying worsens latency.
    const gatingGap = computeGatingGap(dimensions, rubric);
    const passed = gatingGap < rubric.gapThreshold;

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
      revisionCounts.delete(runId);
      return { action: "continue" };
    }

    revisionCounts.set(runId, count);

    // Build per-dimension lines. Advisory dimensions are shown as telemetry, never as action items.
    const dimLines = rubric.dimensions.map((dim) => {
      const score = dimensions[dim.key] ?? 0;
      const tag = dim.advisory ? " (advisory)" : "";
      return `  ${dim.key}: ${score.toFixed(0)}/100${tag}`;
    }).join("\n");

    // Per-weak-dimension failure hints for the revising model.
    const actionItems = rubric.dimensions
      .filter((dim) => !dim.advisory && (dimensions[dim.key] ?? 0) < 70 && dim.failureHint)
      .map((dim) => `  ${dim.key}: ${dim.failureHint}`)
      .join("\n");

    // reason is what the revising harness sees immediately (Stop hook / Codex relay).
    // before_prompt_build may not fire between revision block and continued pass.
    const reason = [
      `[FTAL revision ${count}/${maxRevisions} — rubric: ${rubric.id}, gating gap=${gatingGap.toFixed(0)}, threshold=${rubric.gapThreshold}]`,
      `Dimension scores:\n${dimLines}`,
      actionItems
        ? `Required improvements:\n${actionItems}`
        : "All gating dimensions scored above threshold — recheck faithfulness and factual accuracy.",
    ].join("\n");

    // Queue teaching for the next OpenClaw-managed turn as well (belt-and-suspenders).
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
