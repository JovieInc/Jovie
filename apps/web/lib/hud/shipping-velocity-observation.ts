import type { HudObservationState } from '@/lib/hud/observation';

export interface ShippingVelocityBucketCounts {
  readonly merged: number;
  readonly opened: number;
  readonly closed: number;
}

export function shippingVelocityBucketsAreEmpty(
  data: readonly ShippingVelocityBucketCounts[]
): boolean {
  return (
    data.length === 0 ||
    data.every(
      bucket =>
        bucket.merged === 0 && bucket.opened === 0 && bucket.closed === 0
    )
  );
}

export function observationFromShippingVelocityBuckets(
  data: readonly ShippingVelocityBucketCounts[]
): Extract<HudObservationState, 'fresh' | 'empty'> {
  return shippingVelocityBucketsAreEmpty(data) ? 'empty' : 'fresh';
}
