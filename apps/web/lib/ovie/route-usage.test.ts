import { describe, expect, it } from 'vitest';
import {
  ovieRouteKey,
  ovieUsageDayKey,
  summarizeRouteUsage,
} from './route-usage';

describe('ovieRouteKey', () => {
  it.each([
    ['/app/ov', 'home'],
    ['/app/ov/', 'home'],
    ['/app/ov/inbox', 'inbox'],
    ['/app/ov/people?view=waitlist', 'people'],
    ['/app/admin/shipping', 'shipping'],
    ['/app/ov/growth/yc-metrics', 'growth/yc-metrics'],
    ['/app/ov/lists/9f3a-ids', 'lists'],
    ['/app/ov/agent-runs/abc123', 'agent-runs'],
    ['/app/ov/wiki/some/deep/page', 'wiki'],
  ])('keys %s as %s', (path, key) => {
    expect(ovieRouteKey(path)).toBe(key);
  });

  it.each([
    '/app/settings',
    '/',
    '/app/ovx',
    null,
    undefined,
    '/app/ov/Not Ok!',
  ])('ignores %s', path => {
    expect(ovieRouteKey(path)).toBeNull();
  });
});

describe('route usage summary', () => {
  it('sums views across days, tracks last day, orders by use', () => {
    expect(
      summarizeRouteUsage([
        { day: '2026-10-24', counts: { home: 5, shipping: 1 } },
        { day: '2026-10-25', counts: { home: 3, product: 2, bad: 0 } },
      ])
    ).toEqual([
      { route: 'home', views: 8, lastDay: '2026-10-25' },
      { route: 'product', views: 2, lastDay: '2026-10-25' },
      { route: 'shipping', views: 1, lastDay: '2026-10-24' },
    ]);
  });

  it('keys one hash per UTC day', () => {
    expect(ovieUsageDayKey(new Date('2026-10-25T23:59:00Z'))).toBe(
      'ovie:route-usage:v1:2026-10-25'
    );
  });
});
