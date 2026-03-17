export function toDurationMs(
  startedAtMs: number,
  endedAtMs = Date.now()
): number {
  return Math.max(0, endedAtMs - startedAtMs);
}

export function getOnboardingCompletionMethod(
  shouldAutoSubmitHandle: boolean
): 'auto' | 'manual' {
  return shouldAutoSubmitHandle ? 'auto' : 'manual';
}

export function getValidationFailureKey(
  handle: string,
  reason: string
): string {
  return `${handle}:${reason}`;
}
