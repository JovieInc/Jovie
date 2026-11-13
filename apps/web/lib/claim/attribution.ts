/** Carry only bounded campaign labels. No cookies, analytics or consent changes. */
const CLAIM_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export function appendClaimAttribution(
  destination: URLSearchParams,
  source: URLSearchParams
): void {
  for (const key of CLAIM_UTM_KEYS) {
    const values = source.getAll(key);
    if (values.length !== 1) continue;
    const value = values[0];
    // Reject PII, encoded URLs, control characters and oversized/untrusted values.
    if (value && /^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,127}$/.test(value))
      destination.set(key, value);
  }
}

export function claimHrefWithAttribution(
  path: string,
  source: URLSearchParams
): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  appendClaimAttribution(params, source);
  return `${pathname}${params.size ? `?${params.toString()}` : ''}`;
}
