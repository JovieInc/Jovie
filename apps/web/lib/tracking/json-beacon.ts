/**
 * Post a JSON payload with sendBeacon when possible, falling back to a
 * keepalive fetch for browsers that do not support or reject the beacon.
 *
 * JOV-6585 fail-open contract: the transport is fire-and-forget and never
 * throws — an absent collector (no sendBeacon, no fetch), a blocked network,
 * a 429/500 response, or a hanging request all degrade to `false`. Callers on
 * the primary navigation/listening/capture paths must never await this.
 */
export function postJsonBeacon(
  endpoint: string,
  payload: unknown,
  onError?: () => void
): boolean {
  const body = JSON.stringify(payload);
  const canSendBeacon =
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function';

  if (canSendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const sent = navigator.sendBeacon(endpoint, blob);
    if (sent) return true;
  }

  if (typeof fetch !== 'function') {
    // Absent transport: drop the event instead of breaking the caller.
    onError?.();
    return false;
  }

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      onError?.();
    });
  } catch {
    // A synchronous fetch constructor throw (CSP connect-src violation,
    // sandboxed context) must not break the primary action either.
    onError?.();
  }

  return false;
}
