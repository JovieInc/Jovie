/**
 * Scrub display proofs from Sentry breadcrumbs. The proof rides the URL
 * fragment of `/display/connect#<device>.<ts>.<proof>`; browsers never send a
 * fragment to a server, but a client navigation breadcrumb records the full
 * location, so remove it before it can leave the page.
 */
const FRAGMENT = /(\/display\/connect)#[^\s"'<>)]*/g;
const PROOF = /[a-z0-9][a-z0-9-]{1,39}\.\d{9,12}\.[0-9a-f]{64}/g;
const SCRUBBED = '[scrubbed]';

export function scrubDisplayString(value: string): string {
  return value.replace(FRAGMENT, `$1#${SCRUBBED}`).replace(PROOF, SCRUBBED);
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubDisplayString(value);
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.map(item => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      scrubValue(item, depth + 1),
    ])
  );
}

/** `beforeBreadcrumb` hook: returns the breadcrumb with any proof removed. */
export function scrubDisplayBreadcrumb<
  T extends { message?: string; data?: Record<string, unknown> },
>(breadcrumb: T): T {
  return {
    ...breadcrumb,
    ...(breadcrumb.message === undefined
      ? {}
      : { message: scrubDisplayString(breadcrumb.message) }),
    ...(breadcrumb.data === undefined
      ? {}
      : { data: scrubValue(breadcrumb.data, 0) as Record<string, unknown> }),
  };
}
