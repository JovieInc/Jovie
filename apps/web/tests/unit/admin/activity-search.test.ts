import { describe, expect, it } from 'vitest';
import { filterAdminActivityItems } from '@/lib/admin/activity-search';
import type { AdminActivityItem } from '@/lib/admin/overview';

const items: AdminActivityItem[] = [
  {
    id: 'creator-1',
    user: '@alice',
    action: 'Creator profile created',
    timestamp: '2026-09-28 12:00 UTC',
    status: 'success',
  },
  {
    id: 'stripe-1',
    user: 'Stripe',
    action: 'Invoice payment failed',
    timestamp: '2026-09-28 11:00 UTC',
    status: 'error',
  },
];

describe('filterAdminActivityItems', () => {
  it('returns every item for an empty query', () => {
    expect(filterAdminActivityItems(items, '')).toHaveLength(2);
    expect(filterAdminActivityItems(items, '   ')).toHaveLength(2);
  });

  it('matches actor, action, and status case-insensitively', () => {
    expect(filterAdminActivityItems(items, 'ALICE')).toHaveLength(1);
    expect(filterAdminActivityItems(items, 'payment_failed')).toHaveLength(1);
    expect(
      filterAdminActivityItems(items, 'invoice.payment_failed')
    ).toHaveLength(1);
    expect(filterAdminActivityItems(items, 'payment failed')).toHaveLength(1);
    expect(filterAdminActivityItems(items, 'error')).toHaveLength(1);
    expect(filterAdminActivityItems(items, 'nomatch')).toHaveLength(0);
  });
});
