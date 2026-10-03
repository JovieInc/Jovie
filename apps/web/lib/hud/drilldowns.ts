/**
 * Searchable drill-downs for the canonical Ops `/hud` screen (JOV-5312).
 *
 * Ovie stays read-only presentation: customer, release, and event searches
 * link out to the authoritative admin records (People views, Activity
 * timeline); the operational-exception scope filters the exceptions derived
 * from live `HudMetrics` and links each to its authoritative record.
 */

import { buildAdminPeopleHref } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import type { OpsException } from '@/lib/hud/cockpit';

export const HUD_DRILLDOWN_SCOPES = [
  'customers',
  'releases',
  'events',
  'exceptions',
] as const;

export type HudDrilldownScope = (typeof HUD_DRILLDOWN_SCOPES)[number];

export const HUD_DRILLDOWN_SCOPE_LABELS: Record<HudDrilldownScope, string> = {
  customers: 'Customers',
  releases: 'Releases',
  events: 'Events',
  exceptions: 'Exceptions',
};

export interface HudDrilldownTarget {
  readonly scope: HudDrilldownScope;
  /** GET form action — the authoritative record surface. */
  readonly action: string;
  /** Hidden params the record page requires (e.g. the People view). */
  readonly hiddenParams: Readonly<Record<string, string>>;
  /** Human label for the authoritative record this search opens. */
  readonly recordLabel: string;
}

const RECORD_TARGETS: Record<
  Exclude<HudDrilldownScope, 'exceptions'>,
  HudDrilldownTarget
> = {
  customers: {
    scope: 'customers',
    action: APP_ROUTES.ADMIN_PEOPLE,
    hiddenParams: { view: 'contacts' },
    recordLabel: 'People · Contacts',
  },
  releases: {
    scope: 'releases',
    action: APP_ROUTES.ADMIN_PEOPLE,
    hiddenParams: { view: 'releases' },
    recordLabel: 'People · Releases',
  },
  events: {
    scope: 'events',
    action: APP_ROUTES.ADMIN_ACTIVITY,
    hiddenParams: {},
    recordLabel: 'Activity timeline',
  },
};

export function getHudDrilldownTarget(
  scope: HudDrilldownScope
): HudDrilldownTarget {
  if (scope === 'exceptions') {
    return {
      scope,
      action: APP_ROUTES.ADMIN_OPERATIONS,
      hiddenParams: {},
      recordLabel: 'Operations',
    };
  }
  return RECORD_TARGETS[scope];
}

/**
 * Canonical `/hud` drill-down href. Customer/release/event queries land on
 * the authoritative admin record with `q`; exceptions resolve to the
 * Operations surface (filtering happens inline on the HUD).
 */
export function buildHudDrilldownHref(
  scope: HudDrilldownScope,
  query: string
): string {
  const trimmed = query.trim();
  if (scope === 'customers') {
    return buildAdminPeopleHref(
      'contacts',
      trimmed ? new URLSearchParams({ q: trimmed }) : undefined
    );
  }
  if (scope === 'releases') {
    return buildAdminPeopleHref(
      'releases',
      trimmed ? new URLSearchParams({ q: trimmed }) : undefined
    );
  }
  if (scope === 'events') {
    return trimmed
      ? `${APP_ROUTES.ADMIN_ACTIVITY}?q=${encodeURIComponent(trimmed)}`
      : APP_ROUTES.ADMIN_ACTIVITY;
  }
  return APP_ROUTES.ADMIN_OPERATIONS;
}

/** Case-insensitive match over an exception's label and detail text. */
export function filterOpsExceptions(
  exceptions: readonly OpsException[],
  query: string
): OpsException[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...exceptions];
  return exceptions.filter(exception =>
    `${exception.label} ${exception.detail ?? ''}`
      .toLowerCase()
      .includes(needle)
  );
}
