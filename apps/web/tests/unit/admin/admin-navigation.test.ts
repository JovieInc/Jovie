import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_REGISTRY,
  buildAdminGrowthHref,
  buildAdminPeopleHref,
} from '@/constants/admin-navigation';

describe('admin navigation registry', () => {
  it('defines the consolidated admin destinations in canonical order', () => {
    expect(ADMIN_NAV_REGISTRY.map(item => item.id)).toEqual([
      'overview',
      'people',
      'growth',
      'activity',
      'investors',
      'screenshots',
    ]);
  });

  it('builds people workspace links while preserving existing params', () => {
    const params = new URLSearchParams({
      q: 'tim',
      sort: 'created_desc',
      pageSize: '50',
    });

    expect(buildAdminPeopleHref('creators', params)).toBe(
      '/app/admin/people?q=tim&sort=created_desc&pageSize=50&view=creators'
    );
  });

  it('clears outreach queue filters when switching to a non-outreach growth view', () => {
    const params = new URLSearchParams({
      queue: 'email',
      pageSize: '25',
    });

    expect(buildAdminGrowthHref('campaigns', params)).toBe(
      '/app/admin/growth?pageSize=25&view=campaigns'
    );
  });
});
