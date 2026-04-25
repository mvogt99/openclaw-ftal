import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { parseConfig } from "./src/config.js";
import { resolveRubric } from "./src/rubrics/index.js";
import { HeuristicScorer } from "./src/scorer/heuristic-scorer.js";
import { attachTeachingContext } from "./src/hooks/before-prompt-build.js";
import { createAgentEndHandler } from "./src/hooks/agent-end.js";
import type { ScoringEvent } from "./src/types.js";

export default definePluginEntry({
  id: "openclaw-ftal",
  name: "FTAL Quality Scoring",
  description:
    "Multi-dimensional reply scoring (Faithfulness / Truthfulness / Accuracy / Latency) with optional teaching-context injection.",
  register(api) {
    const config = parseConfig(api.config);
    const scorer = new HeuristicScorer();
    const rubric = resolveRubric(config.rubric, scorer);

    function emitScoringEvent(event: ScoringEvent): void {
      // v1: no cross-plugin event bus on the SDK. Emit as a structured log line.
      // Subscribers parse lines prefixed with "ftal:scoring_event".
      // v2 will use a proper event surface if one lands on the Plugin SDK.
      api.logger.info(`ftal:scoring_event ${JSON.stringify(event)}`);
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
