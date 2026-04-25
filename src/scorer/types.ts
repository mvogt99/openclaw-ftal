import type { AgentContext, DimensionScores, Rubric } from "../types.js";

export interface Scorer {
  score(reply: string, rubric: Rubric, ctx: AgentContext): Promise<DimensionScores>;
}
