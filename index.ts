import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { parseConfig } from "./src/config.js";
import { resolveRubric } from "./src/rubrics/index.js";
import { HeuristicScorer } from "./src/scorer/heuristic-scorer.js";
import { attachTeachingContext } from "./src/hooks/before-prompt-build.js";
import { createAgentEndHandler } from "./src/hooks/agent-end.js";
import { FtalStore } from "./src/store.js";
import type { ScoringEvent, ScoringRecord } from "./src/types.js";

// Re-export store and types for inter-plugin consumption.
// P2 and other plugins import from "openclaw-ftal" or "openclaw-ftal/store".
export { FtalStore } from "./src/store.js";
export type { ScoringRecord, ScoringEvent, ConfidenceState } from "./src/types.js";

export default definePluginEntry({
  id: "openclaw-ftal",
  name: "FTAL Quality Scoring",
  description:
    "Multi-dimensional reply scoring (Faithfulness / Truthfulness / Accuracy / Latency) with optional teaching-context injection.",
  register(api) {
    const config = parseConfig(api.config);
    const scorer = new HeuristicScorer();
    const rubric = resolveRubric(config.rubric, scorer);

    function emitScoringEvent(
      event: ScoringEvent,
      sessionKey: string,
      runId: string,
    ): void {
      // Write to the in-memory store — inter-plugin consumers call FtalStore.getLatest(sessionKey).
      const record: ScoringRecord = { ...event, sessionKey, runId, scoredAt: Date.now() };
      FtalStore.set(record);
      // Secondary structured log line for observability (grep/tail for "ftal:scoring_event").
      api.logger.info(`ftal:scoring_event ${JSON.stringify(record)}`);
    }

    const handleAgentEnd = createAgentEndHandler(
      rubric,
      emitScoringEvent,
      config.retryEnabled,
    );

    api.on("before_prompt_build", attachTeachingContext);
    api.on("agent_end", handleAgentEnd);
  },
});
