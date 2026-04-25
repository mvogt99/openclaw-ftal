import type { AgentContext, DimensionScores, Rubric } from "../types.js";
import type { Scorer } from "./types.js";

/**
 * Rule-based scorer for v1. Produces a rough signal without an LLM call.
 * Replace with ProviderScorer for production quality signals.
 *
 * Heuristics per dimension:
 *   F (Faithfulness)  — penalizes phrases that indicate fabrication / uncertainty hedging
 *   T (Truthfulness)  — penalizes hallucination markers (imports that don't exist, magic paths)
 *   A (Accuracy)      — rewards presence of concrete code blocks / tool output references
 *   L (Latency)       — always 100 in heuristic mode (no timing data at score time)
 */
export class HeuristicScorer implements Scorer {
  async score(reply: string, rubric: Rubric, _ctx: AgentContext): Promise<DimensionScores> {
    const scores: DimensionScores = {};
    for (const dim of rubric.dimensions) {
      scores[dim.key] = this.#scoreOne(dim.key, reply);
    }
    return scores;
  }

  #scoreOne(key: string, reply: string): number {
    const lower = reply.toLowerCase();
    switch (key) {
      case "F": {
        const fabricationPhrases = [
          "i believe",
          "i think",
          "i'm not sure",
          "might be",
          "could be",
          "probably",
          "i assume",
        ];
        const hits = fabricationPhrases.filter((p) => lower.includes(p)).length;
        return Math.max(0, 100 - hits * 15);
      }
      case "T": {
        const hallucinationMarkers = ["todo:", "fixme:", "placeholder", "your-module-name"];
        const hits = hallucinationMarkers.filter((p) => lower.includes(p)).length;
        // reward code blocks as truthfulness signal
        const codeBlocks = (reply.match(/```/g) ?? []).length / 2;
        return Math.min(100, Math.max(0, 70 + codeBlocks * 10 - hits * 20));
      }
      case "A": {
        const hasCode = /```[\s\S]*?```/.test(reply);
        const hasFilePath = /[\w/-]+\.[a-z]{2,5}/.test(reply);
        return (hasCode ? 60 : 30) + (hasFilePath ? 30 : 0);
      }
      case "L":
        // latency not measurable at score time in heuristic mode
        return 100;
      case "completeness": {
        const wordCount = reply.trim().split(/\s+/).length;
        return Math.min(100, wordCount * 2);
      }
      case "directness": {
        const filler = ["as you can see", "it's worth noting", "in conclusion", "to summarize"];
        const hits = filler.filter((p) => lower.includes(p)).length;
        return Math.max(0, 100 - hits * 20);
      }
      default:
        return 70;
    }
  }
}
