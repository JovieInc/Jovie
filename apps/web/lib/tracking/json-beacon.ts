/**
 * Post a JSON payload with sendBeacon when possible, falling back to a
 * keepalive fetch for browsers that do not support or reject the beacon.
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

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    onError?.();
  });

  return false;
}
