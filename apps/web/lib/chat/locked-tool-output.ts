/** Client-safe type guard for entitlement-locked chat tool output. */
export function isLockedToolOutput(
  output: Record<string, unknown> | undefined
): output is Record<string, unknown> & {
  locked: true;
  reason?: string;
  plan_required?: string;
} {
  return output?.locked === true;
}
