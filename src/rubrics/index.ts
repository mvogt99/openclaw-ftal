import type { Rubric } from "../types.js";
import type { Scorer } from "../scorer/types.js";
import { createFtalV1Rubric } from "./ftal-v1.js";
import { createConciseV1Rubric } from "./concise-v1.js";

const REGISTRY = new Map<string, (scorer: Scorer) => Rubric>([
  ["coding-ftal-v1", createFtalV1Rubric],
  ["concise-v1", createConciseV1Rubric],
  // backward-compat alias — removed in v1.0
  ["ftal-v1", createFtalV1Rubric],
]);

export function resolveRubric(id: string, scorer: Scorer): Rubric {
  const factory = REGISTRY.get(id);
  if (!factory) throw new Error(`Unknown rubric: "${id}". Available: ${[...REGISTRY.keys()].join(", ")}`);
  return factory(scorer);
}

export { createFtalV1Rubric, createConciseV1Rubric };
