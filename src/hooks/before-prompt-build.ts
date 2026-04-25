import type { TeachingContext } from "../types.js";

// In-memory store for pending teaching contexts keyed by sessionKey.
// v1 only: no persistence. Cleared after one use.
const pendingTeachings = new Map<string, TeachingContext>();

export function storePendingTeaching(ctx: TeachingContext): void {
  pendingTeachings.set(ctx.sessionKey, ctx);
}

export function clearPendingTeaching(sessionKey: string): void {
  pendingTeachings.delete(sessionKey);
}

export function attachTeachingContext(
  _event: unknown,
  agentCtx: { sessionKey?: string },
): { prependContext?: string } | void {
  const sessionKey = agentCtx.sessionKey;
  if (!sessionKey) return;

  const teaching = pendingTeachings.get(sessionKey);
  if (!teaching) return;

  pendingTeachings.delete(sessionKey);

  const dimLines = Object.entries(teaching.dimensions)
    .map(([k, v]) => `  ${k}: ${v.toFixed(0)}/100`)
    .join("\n");

  const prependContext = [
    `[FTAL quality note — prior reply scored gap=${teaching.gap.toFixed(0)} on rubric "${teaching.rubric}"]`,
    `Dimension scores:\n${dimLines}`,
    `Please ensure your reply improves on the weak dimensions before responding.`,
  ].join("\n");

  return { prependContext };
}
