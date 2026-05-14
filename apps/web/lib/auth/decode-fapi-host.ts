/**
 * Decode the Clerk FAPI host from a publishable key.
 *
 * Clerk publishable keys are formatted as `pk_(live|test)_<base64>` where the
 * base64 payload decodes to `<fapi-host>$`. This is the single canonical place
 * to decode that — both the `/__clerk` proxy middleware and the client-side
 * Clerk JS loader use this helper so they stay in lockstep.
 *
 * Returns `null` when:
 *  - the key is empty/undefined
 *  - the key prefix is malformed
 *  - the base64 payload fails to decode
 *  - the decoded host is empty
 *
 * Never throws. Callers MUST handle the `null` case explicitly (fail closed).
 */
export function decodeFapiHostFromPublishableKey(
  publishableKey: string | null | undefined
): string | null {
  if (!publishableKey) return null;

  const match = publishableKey.match(/^pk_(live|test)_(.+)$/);
  if (!match) return null;

  const b64 = match[2];
  if (!b64) return null;

  try {
    const decoded = atob(b64).replace(/\$$/, '');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}
