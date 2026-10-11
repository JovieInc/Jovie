import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { loadRouteContextMock, loadLinksDataMock, linksPageClientMock } =
  vi.hoisted(() => ({
    loadRouteContextMock: vi.fn(),
    loadLinksDataMock: vi.fn(),
    linksPageClientMock: vi.fn(),
  }));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadRouteContextMock,
}));

vi.mock('@/app/app/(shell)/links/links-data', () => ({
  loadLinksWorkspaceData: loadLinksDataMock,
}));

vi.mock('@/app/app/(shell)/links/LinksPageClient', () => ({
  LinksPageClient: (props: unknown) => {
    linksPageClientMock(props);
    return <div data-testid='links-client'>Links workspace</div>;
  },
}));

vi.mock('@/components/organisms/WorkspacePage', () => ({
  WorkspacePage: ({
    toolbar,
    children,
  }: {
    readonly toolbar?: ReactNode;
    readonly children?: ReactNode;
  }) => (
    <div data-testid='links-page'>
      {toolbar}
      {children}
    </div>
  ),
}));

vi.mock('@/components/organisms/table', () => ({
  PageToolbar: ({ start }: { readonly start?: ReactNode }) => (
    <div>{start}</div>
  ),
  PAGE_TOOLBAR_META_TEXT_CLASS: 'meta',
}));

import LinksPage from '@/app/app/(shell)/links/page';

const profile = {
  id: 'profile_123',
  displayName: 'Tim White',
  username: 'tim',
  usernameNormalized: 'tim-white',
  spotifyId: 'sp-1',
  appleMusicId: null,
  settings: { theme: 'dark' },
};

describe('canonical links page', () => {
  beforeEach(() => {
    loadRouteContextMock.mockReset();
    loadLinksDataMock.mockReset();
    linksPageClientMock.mockReset();
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: profile.id,
      userId: 'user_1',
      dashboardData: { selectedProfile: profile },
    });
    loadLinksDataMock.mockResolvedValue({
      rows: [
        {
          id: 'profile',
          jovieUrl: 'https://jov.ie/tim-white',
          title: 'Tim White',
          type: 'Profile',
          destination: 'https://jov.ie/tim-white',
          status: 'active',
          clicks: 3,
          clicksLabel: 'clicks',
          campaign: null,
          utmSummary: null,
          entityHref: null,
          createdAt: null,
        },
      ],
      loadFailed: false,
    });
  });

  it('loads workspace data for the selected profile and renders the client', async () => {
    render(await LinksPage());

    expect(loadRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.LINKS,
      dashboardErrorLogMessage: 'Dashboard data load failed on links page',
      dashboardErrorMessage: 'Failed to load links. Please refresh the page.',
    });
    expect(loadLinksDataMock).toHaveBeenCalledWith({
      profileId: profile.id,
      profileHandle: 'tim-white',
      profileTitle: 'Tim White',
      releaseProfileContext: {
        userId: 'user_1',
        profileId: profile.id,
        profileHandle: 'tim-white',
        spotifyId: 'sp-1',
        appleMusicId: null,
        settings: { theme: 'dark' },
      },
      route: APP_ROUTES.LINKS,
    });
    expect(linksPageClientMock).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({ id: 'profile' }),
      ]),
    });
    expect(screen.getByText('1 link')).toBeInTheDocument();
    expect(screen.getByTestId('links-client')).toBeInTheDocument();
  });

  it('renders the shared route-context error', async () => {
    loadRouteContextMock.mockResolvedValue({
      ok: false,
      error: <div>Route error</div>,
    });

    render(await LinksPage());

    expect(screen.getByText('Route error')).toBeInTheDocument();
    expect(loadLinksDataMock).not.toHaveBeenCalled();
  });

  it('fails visibly when no artist profile is selected', async () => {
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: null,
      userId: 'user_1',
      dashboardData: { selectedProfile: null },
    });

    render(await LinksPage());

    expect(
      screen.getByText('Select a profile to see your links.')
    ).toBeInTheDocument();
    expect(loadLinksDataMock).not.toHaveBeenCalled();
  });

  it('pluralizes the toolbar count', async () => {
    loadLinksDataMock.mockResolvedValue({ rows: [], loadFailed: false });

    render(await LinksPage());

    expect(screen.getByText('0 links')).toBeInTheDocument();
  });

  it('tells the user when a link family failed to load', async () => {
    loadLinksDataMock.mockResolvedValue({ rows: [], loadFailed: true });

    render(await LinksPage());

    expect(
      screen.getByText('0 links · some links could not be loaded')
    ).toBeInTheDocument();
  });
});
