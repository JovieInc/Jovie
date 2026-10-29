'use client';

import { GithubHeadroomTile } from './GithubHeadroomTile';
import { useHudShippingStateQuery } from './useHudShippingStateQuery';

/**
 * Fleet's GitHub API headroom, from the lanes status feed (`githubHeadroom`,
 * published by the lanes doctor). Reads Unknown until the shipping read lands
 * or when the feed carries no current-hour sample.
 */
export function GithubHeadroomPanel() {
  const query = useHudShippingStateQuery(null);
  const report = query.view.delivery.lanes.githubHeadroom ?? null;
  return <GithubHeadroomTile report={report} nowMs={Date.now()} />;
}
