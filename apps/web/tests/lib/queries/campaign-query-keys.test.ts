import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';

describe('campaign query keys', () => {
  it('includes a stable overview key', () => {
    expect(queryKeys.campaign.overview()).toEqual([
      'campaign-invites',
      'overview',
    ]);
  });

  it('includes invites key with pagination params', () => {
    expect(queryKeys.campaign.invites({ limit: 10, offset: 20 })).toEqual([
      'campaign-invites',
      'invites',
      { limit: 10, offset: 20 },
    ]);
  });
});
