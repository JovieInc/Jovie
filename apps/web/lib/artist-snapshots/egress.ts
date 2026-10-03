/**
 * Social-network HTML is not fetched from Jovie core server IPs.
 * These stubs stay typed until an isolated egress layer exists.
 */
export const ISOLATED_EGRESS_SKIP_REASON = 'needs_isolated_egress' as const;
export interface IsolatedEgressSnapshot {
  readonly kind: 'skip';
  readonly reason: typeof ISOLATED_EGRESS_SKIP_REASON;
  readonly source: 'instagram' | 'youtube_logged_out_page';
}
export function instagramSnapshotFromCore(): IsolatedEgressSnapshot {
  return {
    kind: 'skip',
    reason: ISOLATED_EGRESS_SKIP_REASON,
    source: 'instagram',
  };
}
export function youtubeLoggedOutPageSnapshotFromCore(): IsolatedEgressSnapshot {
  return {
    kind: 'skip',
    reason: ISOLATED_EGRESS_SKIP_REASON,
    source: 'youtube_logged_out_page',
  };
}
