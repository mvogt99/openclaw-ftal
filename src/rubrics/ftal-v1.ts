import type { AgentContext, DimensionScores, Rubric } from "../types.js";
import type { Scorer } from "../scorer/types.js";

/**
 * Four-dimensional rubric for coding-heavy agent tasks.
 * F: Faithfulness — reply grounded in provided/retrieved context
 * T: Truthfulness  — factual claims correct; no fabrication
 * A: Accuracy      — output correctly satisfies the stated task
 * L: Latency       — arrived within budget for the task class (advisory only)
 *
 * F and T dominate (40/40) because silent fabrication is the primary
 * failure mode in coding tasks. L is advisory: retrying worsens latency,
 * so it is reported but never drives a revise decision.
 */
export const ftalV1Rubric: Rubric = {
  id: "coding-ftal-v1",
  gapThreshold: 30,
  dimensions: [
    { key: "F", weight: 40, failureHint: "Cite or ground unsupported claims in the provided context." },
    { key: "T", weight: 40, failureHint: "Remove or verify any guessed API names, function signatures, or facts." },
    { key: "A", weight: 10, failureHint: "Complete the requested implementation or test path — do not leave stubs." },
    { key: "L", weight: 10, advisory: true },
  ],
  async score(reply: string, ctx: AgentContext): Promise<DimensionScores> {
    // deferred to the registered scorer — see index.ts
    throw new Error("score() must be delegated through createRubricScorer()");
  },
};

export function createFtalV1Rubric(scorer: Scorer): Rubric {
  return {
    ...ftalV1Rubric,
    score(reply: string, ctx: AgentContext): Promise<DimensionScores> {
      return scorer.score(reply, ftalV1Rubric, ctx);
    },
  };
}
