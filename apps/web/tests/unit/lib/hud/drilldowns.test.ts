import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { OpsException } from '@/lib/hud/cockpit';
import {
  buildHudDrilldownHref,
  filterOpsExceptions,
  getHudDrilldownTarget,
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

  it('omits q for empty queries', () => {
    expect(buildHudDrilldownHref('events', '   ')).toBe(
      APP_ROUTES.ADMIN_ACTIVITY
    );
    expect(buildHudDrilldownHref('customers', '')).toBe(
      `${APP_ROUTES.ADMIN_PEOPLE}?view=contacts`
    );
  });
});

describe('getHudDrilldownTarget', () => {
  it('declares a target for every scope', () => {
    for (const scope of HUD_DRILLDOWN_SCOPES) {
      const target = getHudDrilldownTarget(scope);
      expect(target.action).toBeTruthy();
      expect(target.recordLabel).toBeTruthy();
    }
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

  it('returns all exceptions for an empty query', () => {
    expect(filterOpsExceptions(exceptions, '')).toHaveLength(2);
  });

  it('matches on label and detail, case-insensitive', () => {
    expect(filterOpsExceptions(exceptions, 'DEPLOY')).toHaveLength(1);
    expect(filterOpsExceptions(exceptions, 'credentials')).toHaveLength(1);
    expect(filterOpsExceptions(exceptions, 'nomatch')).toHaveLength(0);
  });
});
