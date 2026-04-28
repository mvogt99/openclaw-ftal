export type ConfidenceState = "provisional" | "verified" | "refuted";

export type DimensionScores = Record<string, number>;

export interface RubricDimension {
  readonly key: string;
  readonly weight: number;
  // advisory: true = reported in scores but excluded from gating gap.
  // Use for dimensions where a bad score cannot be improved by retrying
  // (e.g. L/Latency — retrying necessarily makes latency worse).
  readonly advisory?: boolean;
  // Human-readable guidance shown in the revise reason when this dimension is weak.
  readonly failureHint?: string;
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

// ScoringRecord is the stored form of a ScoringEvent — adds identity and timestamp.
// Exported from openclaw-ftal/store for inter-plugin consumption (e.g. P2 accountability).
export interface ScoringRecord extends ScoringEvent {
  sessionKey: string; // required in stored form (optional in ScoringEvent)
  runId: string;      // required in stored form
  scoredAt: number;   // Date.now() at time of scoring
}
