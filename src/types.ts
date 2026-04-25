export type ConfidenceState = "provisional" | "verified" | "refuted";

export type DimensionScores = Record<string, number>;

export interface RubricDimension {
  readonly key: string;
  readonly weight: number;
}

export interface Rubric {
  readonly id: string;
  readonly dimensions: ReadonlyArray<RubricDimension>;
  readonly gapThreshold: number;
  score(reply: string, ctx: AgentContext): Promise<DimensionScores>;
}

export interface AgentContext {
  sessionKey?: string;
  agentId?: string;
  runId?: string;
  modelId?: string;
}

export interface ScoringEvent {
  rubric: string;
  dimensions: DimensionScores;
  gap: number;
  passed: boolean;
  confidence: ConfidenceState;
  sessionKey?: string;
  runId?: string;
  memoryIds?: string[];
}

export interface TeachingContext {
  sessionKey: string;
  rubric: string;
  gap: number;
  dimensions: DimensionScores;
  suggestedContext: string;
}
