import { describe, expect, it } from 'vitest';
import {
  artistProfileNavItem,
  artistSettingsNavigation,
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  newThreadNavItem,
  primaryNavigation,
  settingsNavItem,
  touringNavItem,
  userSettingsNavigation,
} from './config';
import type { NavItem } from './types';

// Canonical nav items that mobile is allowed to reference. Anything mobile
// renders must come from this set (or the shared exports above) so desktop
// and mobile can never drift — see JOV-12644.
const CANONICAL_ITEM_IDS = new Set([
  ...primaryNavigation.map(item => item.id),
  artistProfileNavItem.id,
  touringNavItem.id,
  settingsNavItem.id,
]);

describe('mobile nav derivation', () => {
  it('never defines a mobile-only NavItem — every id traces back to a canonical item', () => {
    for (const item of [
      ...mobilePrimaryNavigation,
      ...mobileExpandedNavigation,
    ]) {
      expect(CANONICAL_ITEM_IDS.has(item.id)).toBe(true);
    }
  });

  it('uses the shared chat entry point instead of a redefined "home" item', () => {
    expect(mobilePrimaryNavigation[0]).toBe(newThreadNavItem);
  });
});

// ---------------------------------------------------------------------------
// Nav IA snapshot — freezes labels, hrefs, and order for every canonical nav
// list before the One App Shell refactor swarm starts. Any change to a nav
// item's id/label/href, or its position within a list, must show up as an
// explicit snapshot diff in review rather than a silent drift. See
// .context/one-shell/manifests/0-1-nav-guardrails.md (GH #12633 / #12645).
// ---------------------------------------------------------------------------

interface NavSnapshotEntry {
  id: string;
  label: string;
  href: string;
  order: number;
}

function toSnapshotProjection(items: NavItem[]): NavSnapshotEntry[] {
  return items.map((item, order) => ({
    id: item.id,
    label: item.name,
    href: item.href,
    order,
  }));
}

describe('nav IA snapshot', () => {
  it('freezes desktop primary navigation', () => {
    expect(toSnapshotProjection(primaryNavigation)).toMatchInlineSnapshot(`
      [
        {
          "href": "/app/chat",
          "id": "chat",
          "label": "New Chat",
          "order": 0,
        },
        {
          "href": "/app/library?view=releases",
          "id": "releases",
          "label": "Releases",
          "order": 1,
        },
        {
          "href": "/app/settings/artist-profile",
          "id": "artist-profile",
          "label": "Artist Profile",
          "order": 2,
        },
        {
          "href": "/app/settings/touring",
          "id": "touring",
          "label": "Touring",
          "order": 3,
        },
        {
          "href": "/app/calendar",
          "id": "calendar",
          "label": "Calendar",
          "order": 4,
        },
        {
          "href": "/app/tasks",
          "id": "tasks",
          "label": "Tasks",
          "order": 5,
        },
        {
          "href": "/app/audience",
          "id": "audience",
          "label": "Audience",
          "order": 6,
        },
      ]
    `);
  });

  it('freezes mobile primary (bottom-bar) navigation', () => {
    expect(
      toSnapshotProjection(mobilePrimaryNavigation)
    ).toMatchInlineSnapshot(`
      [
        {
          "href": "/app/chat",
          "id": "chat",
          "label": "New Chat",
          "order": 0,
        },
        {
          "href": "/app/library?view=releases",
          "id": "releases",
          "label": "Releases",
          "order": 1,
        },
        {
          "href": "/app/audience",
          "id": "audience",
          "label": "Audience",
          "order": 2,
        },
      ]
    `);
  });

  it('freezes mobile expanded ("more") navigation', () => {
    expect(
      toSnapshotProjection(mobileExpandedNavigation)
    ).toMatchInlineSnapshot(`
      [
        {
          "href": "/app/settings/artist-profile",
          "id": "artist-profile",
          "label": "Artist Profile",
          "order": 0,
        },
        {
          "href": "/app/settings/touring",
          "id": "touring",
          "label": "Touring",
          "order": 1,
        },
        {
          "href": "/app/calendar",
          "id": "calendar",
          "label": "Calendar",
          "order": 2,
        },
        {
          "href": "/app/tasks",
          "id": "tasks",
          "label": "Tasks",
          "order": 3,
        },
        {
          "href": "/app/settings",
          "id": "settings",
          "label": "Settings",
          "order": 4,
        },
      ]
    `);
  });

  it('freezes user settings navigation', () => {
    expect(toSnapshotProjection(userSettingsNavigation)).toMatchInlineSnapshot(`
      [
        {
          "href": "/app/settings/account",
          "id": "account",
          "label": "Account",
          "order": 0,
        },
        {
          "href": "/app/settings/usage",
          "id": "usage",
          "label": "Usage Stats",
          "order": 1,
        },
        {
          "href": "/app/settings/billing",
          "id": "billing",
          "label": "Billing & Subscription",
          "order": 2,
        },
        {
          "href": "/app/settings/data-privacy",
          "id": "data-privacy",
          "label": "Data & Privacy",
          "order": 3,
        },
      ]
    `);
  });

  it('freezes artist settings navigation', () => {
    expect(
      toSnapshotProjection(artistSettingsNavigation)
    ).toMatchInlineSnapshot(`
      [
        {
          "href": "/app/settings/artist-profile",
          "id": "artist-profile",
          "label": "Profile",
          "order": 0,
        },
        {
          "href": "/app/settings/contacts",
          "id": "contacts",
          "label": "Contacts",
          "order": 1,
        },
        {
          "href": "/app/settings/touring",
          "id": "touring",
          "label": "Touring",
          "order": 2,
        },
        {
          "href": "/app/settings/analytics",
          "id": "analytics",
          "label": "Analytics",
          "order": 3,
        },
        {
          "href": "/app/settings/audience",
          "id": "audience-tracking",
          "label": "Audience & Tracking",
          "order": 4,
        },
      ]
    `);
  });
});
