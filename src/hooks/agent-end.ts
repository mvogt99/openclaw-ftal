import type { Rubric, ScoringEvent, TeachingContext } from "../types.js";
import { storePendingTeaching } from "./before-prompt-build.js";

type AgentEndEvent = {
  messages: unknown[];
  success: boolean;
  error?: string;
  durationMs?: number;
};

type AgentEndContext = {
  sessionKey?: string;
  runId?: string;
};

type ScoringEventEmitter = (event: ScoringEvent) => void;

/**
 * Extract the text of the last assistant message from an unknown[] message array.
 * pi-agent-core messages are { role, content } where content is string | ContentBlock[].
 */
export function extractLastAssistantText(messages: unknown[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (m["role"] !== "assistant") continue;
    const content = m["content"];
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const texts = content
        .filter((b): b is { type: "text"; text: string } =>
          typeof b === "object" && b !== null && (b as Record<string, unknown>)["type"] === "text",
        )
        .map((b) => b.text);
      if (texts.length > 0) return texts.join("");
    }
  }
  return undefined;
}

export function computeGap(dimensions: Record<string, number>, rubric: Rubric): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const dim of rubric.dimensions) {
    const score = dimensions[dim.key] ?? 0;
    weighted += score * dim.weight;
    totalWeight += dim.weight;
  }
  const weightedAvg = totalWeight > 0 ? weighted / totalWeight : 0;
  return Math.max(0, 100 - weightedAvg);
}

export function createAgentEndHandler(
  rubric: Rubric,
  emitScoringEvent: ScoringEventEmitter,
  retryEnabled: boolean,
) {
  return async function handleAgentEnd(
    event: AgentEndEvent,
    ctx: AgentEndContext,
  ): Promise<void> {
    if (!event.success) return;

    const replyText = extractLastAssistantText(event.messages);
    if (!replyText) return;

    const agentCtx = {
      sessionKey: ctx.sessionKey,
      runId: ctx.runId,
    };

    const dimensions = await rubric.score(replyText, agentCtx);
    const gap = computeGap(dimensions, rubric);
    const passed = gap < rubric.gapThreshold;

    const scoringEvent: ScoringEvent = {
      rubric: rubric.id,
      dimensions,
      gap,
      passed,
      confidence: "provisional",
      sessionKey: ctx.sessionKey,
      runId: ctx.runId,
    };

    emitScoringEvent(scoringEvent);

    if (retryEnabled && !passed && ctx.sessionKey) {
      const teaching: TeachingContext = {
        sessionKey: ctx.sessionKey,
        rubric: rubric.id,
        gap,
        dimensions,
        suggestedContext: `Prior reply failed FTAL scoring (gap=${gap.toFixed(0)}). Focus on improving weak dimensions.`,
      };
      storePendingTeaching(teaching);
    }
  };
}
