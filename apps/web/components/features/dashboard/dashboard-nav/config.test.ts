import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  primaryNavigation,
} from './config';

const CANONICAL_SIX = [
  ['chat', 'New Chat', APP_ROUTES.CHAT],
  ['inbox', 'Inbox', APP_ROUTES.DASHBOARD],
  ['library', 'Library', APP_ROUTES.LIBRARY],
  ['contacts', 'Contacts', APP_ROUTES.CONTACTS],
  ['calendar', 'Calendar', APP_ROUTES.CALENDAR],
  ['tasks', 'Tasks', APP_ROUTES.TASKS],
] as const;

function toContract(items: readonly (typeof primaryNavigation)[number][]) {
  return items.map(item => [item.id, item.name, item.href]);
}

describe('canonical customer shell navigation', () => {
  it('keeps New Chat as the elevated first action in the exact customer order', () => {
    expect(toContract(primaryNavigation)).toEqual(CANONICAL_SIX);
    expect(primaryNavigation[0].tone).toBe('primary');
  });

  it('detects missing and reordered canonical destinations', () => {
    expect(toContract(primaryNavigation.slice(0, -1))).not.toEqual(
      CANONICAL_SIX
    );
    expect(toContract([...primaryNavigation].reverse())).not.toEqual(
      CANONICAL_SIX
    );
  });

  it('derives mobile primary + More destinations from the same object identities', () => {
    expect(mobilePrimaryNavigation).toEqual(primaryNavigation.slice(0, 3));
    expect(mobileExpandedNavigation).toEqual(primaryNavigation.slice(3));
    expect([...mobilePrimaryNavigation, ...mobileExpandedNavigation]).toEqual(
      primaryNavigation
    );

    for (const [index, item] of [
      ...mobilePrimaryNavigation,
      ...mobileExpandedNavigation,
    ].entries()) {
      expect(item).toBe(primaryNavigation[index]);
    }
  });

  it('excludes retired primary destinations while preserving route constants', () => {
    const ids = primaryNavigation.map(item => item.id);
    const labels = primaryNavigation.map(item => item.name);

    expect(ids).not.toEqual(
      expect.arrayContaining([
        'search',
        'touring',
        'audience',
        'profiles',
        'releases',
      ])
    );
    expect(labels).not.toEqual(
      expect.arrayContaining([
        'Search',
        'Touring',
        'Audience',
        'Profiles',
        'Releases',
      ])
    );
    expect(APP_ROUTES.TOUR_DATES).toBe('/app/tour-dates');
    expect(APP_ROUTES.AUDIENCE).toBe('/app/audience');
    expect(APP_ROUTES.PROFILES).toBe('/app/profiles');
    expect(APP_ROUTES.RELEASES).toBe('/app/releases');
  });
});
