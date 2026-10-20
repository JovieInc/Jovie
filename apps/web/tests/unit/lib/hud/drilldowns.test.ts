import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { OpsException } from '@/lib/hud/cockpit';
import {
  buildHudDrilldownHref,
  filterOpsExceptions,
  getHudDrilldownTarget,
  HUD_DRILLDOWN_SCOPE_LABELS,
  HUD_DRILLDOWN_SCOPES,
} from '@/lib/hud/drilldowns';

describe('buildHudDrilldownHref', () => {
  it('routes customer searches to the authoritative People contacts record', () => {
    expect(buildHudDrilldownHref('customers', 'tim')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?q=tim&view=contacts`
    );
  });

  it('routes release searches to the authoritative People releases record', () => {
    expect(buildHudDrilldownHref('releases', 'midnight')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?q=midnight&view=releases`
    );
  });

  it('routes event searches to the activity timeline with q', () => {
    expect(buildHudDrilldownHref('events', 'payout failed')).toBe(
      `${APP_ROUTES.ADMIN_ACTIVITY}?q=payout%20failed`
    );
  });

  it('routes exceptions to the operations record', () => {
    expect(buildHudDrilldownHref('exceptions', 'stripe')).toBe(
      APP_ROUTES.ADMIN_OPERATIONS
    );
  });

  it('trims and encodes the query', () => {
    expect(buildHudDrilldownHref('events', '  a&b=c  ')).toBe(
      `${APP_ROUTES.ADMIN_ACTIVITY}?q=a%26b%3Dc`
    );
    expect(buildHudDrilldownHref('customers', '  tim w ')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?q=tim+w&view=contacts`
    );
  });

  it('omits q for empty queries', () => {
    expect(buildHudDrilldownHref('releases', ' ')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?view=releases`
    );
    expect(buildHudDrilldownHref('events', '   ')).toBe(
      APP_ROUTES.ADMIN_ACTIVITY
    );
    expect(buildHudDrilldownHref('customers', '')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?view=contacts`
    );
  });
});

describe('getHudDrilldownTarget', () => {
  it('maps every scope to its authoritative record surface', () => {
    expect(HUD_DRILLDOWN_SCOPES.map(getHudDrilldownTarget)).toEqual([
      {
        scope: 'customers',
        action: APP_ROUTES.ADMIN_PEOPLE,
        hiddenParams: { view: 'contacts' },
        recordLabel: 'People · Contacts',
      },
      {
        scope: 'releases',
        action: APP_ROUTES.ADMIN_PEOPLE,
        hiddenParams: { view: 'releases' },
        recordLabel: 'People · Releases',
      },
      {
        scope: 'events',
        action: APP_ROUTES.ADMIN_ACTIVITY,
        hiddenParams: {},
        recordLabel: 'Activity timeline',
      },
      {
        scope: 'exceptions',
        action: APP_ROUTES.ADMIN_OPERATIONS,
        hiddenParams: {},
        recordLabel: 'Operations',
      },
    ]);
  });

  it('labels every scope for the scope picker', () => {
    expect(HUD_DRILLDOWN_SCOPE_LABELS).toEqual({
      customers: 'Customers',
      releases: 'Releases',
      events: 'Events',
      exceptions: 'Exceptions',
    });
  });
});

describe('filterOpsExceptions', () => {
  const exceptions: OpsException[] = [
    {
      id: 'deploy-failed',
      label: 'Latest deploy failed',
      detail: 'main',
      href: 'https://example.com/run/42',
    },
    {
      id: 'source-stripe',
      label: 'Stripe is unreachable',
      detail: 'Check Stripe API credentials and retry.',
      href: 'https://dashboard.stripe.com/',
    },
  ];

  const noDetail: OpsException = {
    id: 'queue-stuck',
    label: 'Merge queue stuck',
    href: 'https://example.com/queue',
  };

  it('returns a copy of every exception for a blank query', () => {
    const all = filterOpsExceptions(exceptions, '   ');
    expect(all).toEqual(exceptions);
    expect(all).not.toBe(exceptions);
  });

  it('matches on label and detail, case-insensitive', () => {
    expect(filterOpsExceptions(exceptions, 'DEPLOY')).toEqual([exceptions[0]]);
    expect(filterOpsExceptions(exceptions, 'credentials')).toEqual([
      exceptions[1],
    ]);
    expect(filterOpsExceptions(exceptions, 'stripe')).toEqual([exceptions[1]]);
    expect(filterOpsExceptions(exceptions, 'nomatch')).toEqual([]);
  });

  it('trims the query and matches across the label/detail boundary', () => {
    expect(filterOpsExceptions(exceptions, '  Failed MAIN  ')).toEqual([
      exceptions[0],
    ]);
  });

  it('treats a missing detail as empty text', () => {
    expect(filterOpsExceptions([noDetail], 'undefined')).toEqual([]);
    expect(filterOpsExceptions([noDetail], 'queue')).toEqual([noDetail]);
  });
});
