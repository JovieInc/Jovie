import { describe, expect, it } from 'vitest';
import {
  observationFromShippingVelocityBuckets,
  shippingVelocityBucketsAreEmpty,
} from '@/lib/hud/shipping-velocity-observation';

describe('shipping-velocity-observation', () => {
  it('treats all-zero buckets as empty, not missing configuration', () => {
    const buckets = [
      { merged: 0, opened: 0, closed: 0 },
      { merged: 0, opened: 0, closed: 0 },
    ];

    expect(shippingVelocityBucketsAreEmpty(buckets)).toBe(true);
    expect(observationFromShippingVelocityBuckets(buckets)).toBe('empty');
  });

  it('treats any activity as a fresh observation', () => {
    const buckets = [{ merged: 1, opened: 0, closed: 0 }];

    expect(shippingVelocityBucketsAreEmpty(buckets)).toBe(false);
    expect(observationFromShippingVelocityBuckets(buckets)).toBe('fresh');
  });
});
