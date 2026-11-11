import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CalendarRouteSkeleton } from './calendar/CalendarRouteSkeleton';
import { LibraryLoadingState } from './library/LibraryLoadingState';
import { LinksPageClient } from './links/LinksPageClient';
import {
  LINKS_TABLE_HEADERS,
  LinksRouteSkeleton,
} from './links/LinksRouteSkeleton';
import {
  PROFILES_TABLE_SKELETON_COLUMNS,
  ProfilesRouteSkeleton,
} from './profiles/ProfilesRouteSkeleton';
import { SettingsRouteSkeleton } from './settings/SettingsRouteSkeleton';
import { resolveShellRouteSkeleton } from './shell-route-skeleton';
import { TourDatesRouteSkeleton } from './tour-dates/TourDatesRouteSkeleton';

const shellDirectory = __dirname;

function skeletonType(pathname: string | null) {
  const node = resolveShellRouteSkeleton(pathname);
  return isValidElement(node) ? (node as ReactElement).type : node;
}

afterEach(() => cleanup());

describe('resolveShellRouteSkeleton', () => {
  it.each([
    [APP_ROUTES.CALENDAR, CalendarRouteSkeleton],
    [APP_ROUTES.LINKS, LinksRouteSkeleton],
    [APP_ROUTES.DASHBOARD_LINKS, LinksRouteSkeleton],
    [APP_ROUTES.PRESENCE, ProfilesRouteSkeleton],
    [APP_ROUTES.PROFILES, ProfilesRouteSkeleton],
    [APP_ROUTES.TOUR_DATES, TourDatesRouteSkeleton],
    [APP_ROUTES.SETTINGS_ACCOUNT, SettingsRouteSkeleton],
    [APP_ROUTES.SETTINGS_PROFILE, SettingsRouteSkeleton],
    [APP_ROUTES.EARNINGS, SettingsRouteSkeleton],
    [APP_ROUTES.LIBRARY, LibraryLoadingState],
  ])('gives %s its own route-shaped skeleton', (pathname, expected) => {
    expect(skeletonType(pathname)).toBe(expected);
  });

  it('keeps the generic shell main when the destination is unknown', () => {
    expect(resolveShellRouteSkeleton(null)).toBeUndefined();
  });

  it('keeps the warm-navigation contract: no segment loading boundary', () => {
    for (const route of [
      'calendar',
      'links',
      'presence',
      'earnings',
      'tour-dates',
      'settings',
    ]) {
      expect(() =>
        readFileSync(join(shellDirectory, route, 'loading.tsx'), 'utf8')
      ).toThrow();
    }
  });
});

describe('route skeletons', () => {
  it.each([
    ['Loading Calendar', <CalendarRouteSkeleton key='calendar' />],
    ['Loading Links', <LinksRouteSkeleton key='links' />],
    ['Loading Profiles', <ProfilesRouteSkeleton key='profiles' />],
    ['Loading tour dates', <TourDatesRouteSkeleton key='tour' />],
    ['Loading Settings', <SettingsRouteSkeleton key='settings' />],
  ])('announces %s as a busy region', (label, element) => {
    render(element);
    const region = screen.getByLabelText(label);
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('draws the Links header row the loaded table draws', () => {
    render(<LinksRouteSkeleton />);
    const skeletonHeaders = within(
      screen.getByTestId('links-route-skeleton')
    ).getAllByRole('columnheader');
    expect(skeletonHeaders.map(cell => cell.textContent)).toEqual(
      LINKS_TABLE_HEADERS.map(header => header.name)
    );
    cleanup();

    render(
      <RightPanelProvider>
        <LinksPageClient
          rows={[
            {
              id: 'row-1',
              jovieUrl: 'https://jov.ie/tim/midnight-city',
              title: 'Midnight City',
              type: 'Release',
              destination: 'https://open.spotify.com/album/xyz',
              status: 'active',
              clicks: 17,
              clicksLabel: '7d clicks',
              campaign: null,
              utmSummary: null,
              entityHref: '/app/releases/release-9',
              createdAt: null,
            },
          ]}
        />
      </RightPanelProvider>
    );
    expect(
      screen.getAllByRole('columnheader').map(cell => cell.textContent)
    ).toEqual(LINKS_TABLE_HEADERS.map(header => header.name));
  });

  it('keeps the Profiles skeleton columns pinned to the live table', () => {
    const source = readFileSync(
      join(shellDirectory, 'profiles', 'ProfilesWorkspace.tsx'),
      'utf8'
    );
    for (const column of PROFILES_TABLE_SKELETON_COLUMNS) {
      const header = String(column.header);
      const declaration = new RegExp(
        `header: (?:'${header}'|\\(\\) => <span className='sr-only'>${header}</span>),\\s+size: ${column.size},`
      );
      expect(source, `${column.id} column geometry`).toMatch(declaration);
    }
  });

  it('draws the settings skeleton inside the real settings layout', () => {
    render(<SettingsRouteSkeleton />);
    const skeleton = screen.getByTestId('settings-route-skeleton');
    expect(
      skeleton.closest('[data-settings-layout-column="true"]')
    ).not.toBeNull();
    expect(
      skeleton.closest('[data-testid="settings-shell-content"]')
    ).not.toBeNull();
  });
});

describe('resolved shell skeletons are accessible loading states', () => {
  it.each([
    APP_ROUTES.CHAT,
    APP_ROUTES.RELEASES,
    APP_ROUTES.LIBRARY,
    APP_ROUTES.LYRICS,
    APP_ROUTES.TASKS,
    APP_ROUTES.CALENDAR,
    APP_ROUTES.LINKS,
    APP_ROUTES.PRESENCE,
    APP_ROUTES.TOUR_DATES,
    APP_ROUTES.SETTINGS_ACCOUNT,
    APP_ROUTES.EARNINGS,
  ])('renders an axe-clean skeleton for %s', async pathname => {
    const node = resolveShellRouteSkeleton(pathname);
    expect(isValidElement(node)).toBe(true);
    const { container } = render(
      <RightPanelProvider>
        <main>{node}</main>
      </RightPanelProvider>
    );

    expect(container.querySelector('main')?.childElementCount).toBe(1);
    await expectNoA11yViolations(container);
  });
});
