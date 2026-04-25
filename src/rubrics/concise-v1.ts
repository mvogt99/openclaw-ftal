import type { AgentContext, DimensionScores, Rubric } from "../types.js";
import type { Scorer } from "../scorer/types.js";

/**
 * Two-dimensional rubric for short-form / conversational replies.
 * completeness: did the reply cover what was asked?
 * directness:   did it arrive without padding or filler?
 */
export const conciseV1Rubric: Rubric = {
  id: "concise-v1",
  gapThreshold: 40,
  dimensions: [
    { key: "completeness", weight: 60 },
    { key: "directness", weight: 40 },
  ],
  async score(_reply: string, _ctx: AgentContext): Promise<DimensionScores> {
    throw new Error("score() must be delegated through createConciseV1Rubric()");
  },
};

export function createConciseV1Rubric(scorer: Scorer): Rubric {
  return {
    ...conciseV1Rubric,
    score(reply: string, ctx: AgentContext): Promise<DimensionScores> {
      return scorer.score(reply, conciseV1Rubric, ctx);
    },
  };
}
