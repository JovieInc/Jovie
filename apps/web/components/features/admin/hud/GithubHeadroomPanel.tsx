'use client';

import { useQuery } from '@tanstack/react-query';
import { shippingStateQueryOptions } from '@/lib/queries/shipping-state';
import { GithubHeadroomTile } from './GithubHeadroomTile';

/**
 * Fleet's GitHub API headroom, from the lanes status feed (`githubHeadroom`,
 * published by the lanes doctor). Reads Unknown until the shipping read lands
 * or when the feed carries no current-hour sample.
 */
export function GithubHeadroomPanel() {
  const query = useQuery(shippingStateQueryOptions);
  const report = query.data?.delivery?.lanes?.githubHeadroom ?? null;
  return <GithubHeadroomTile report={report} nowMs={Date.now()} />;
}
