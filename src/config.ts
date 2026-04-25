import { z } from "zod";

export const ftalConfigSchema = z.object({
  rubric: z.string().default("ftal-v1"),
  gapThreshold: z.number().min(0).max(100).optional(),
  retryEnabled: z.boolean().default(false),
  retryMaxIterations: z.number().min(1).max(10).default(3),
});

export type FtalConfig = z.infer<typeof ftalConfigSchema>;

export function parseConfig(raw: unknown): FtalConfig {
  return ftalConfigSchema.parse(raw ?? {});
}
