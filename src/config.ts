import { z } from "zod";

export const ftalConfigSchema = z.object({
  rubric: z.string().default("coding-ftal-v1"),
  gapThreshold: z.number().min(0).max(100).optional(),
  retryEnabled: z.boolean().default(false),
  retryMaxIterations: z.number().min(1).max(10).default(3),
  // Opt-in for before_agent_finalize gating (blocks delivery and requests revision).
  // Requires OpenClaw >= commit f3accc753c (#71765) and allowConversationAccess: true.
  // Falls back gracefully if the hook is unavailable in older OpenClaw versions.
  useFinalize: z.boolean().default(false),
  maxRevisions: z.number().min(1).max(10).default(3),
});

export type FtalConfig = z.infer<typeof ftalConfigSchema>;

export function parseConfig(raw: unknown): FtalConfig {
  return ftalConfigSchema.parse(raw ?? {});
}
