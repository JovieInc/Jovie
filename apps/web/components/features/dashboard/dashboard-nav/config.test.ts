import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  mobileExpandedNavigation,
  mobilePrimaryNavigation,
  primaryNavigation,
} from './config';

const CANONICAL_SIX = [
  ['inbox', 'Inbox', APP_ROUTES.DASHBOARD],
  ['chat', 'Chat', APP_ROUTES.CHAT],
  ['library', 'Library', APP_ROUTES.LIBRARY],
  ['contacts', 'Contacts', APP_ROUTES.CONTACTS],
  ['calendar', 'Calendar', APP_ROUTES.CALENDAR],
  ['tasks', 'Tasks', APP_ROUTES.TASKS],
] as const;

function toContract(items: typeof primaryNavigation) {
  return items.map(item => [item.id, item.name, item.href]);
}

describe('canonical customer shell navigation', () => {
  it('keeps the founder-approved six destinations in exact order', () => {
    expect(toContract(primaryNavigation)).toEqual(CANONICAL_SIX);
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
