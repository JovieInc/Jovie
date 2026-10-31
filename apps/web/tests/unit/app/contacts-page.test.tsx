import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  loadRouteContextMock,
  contactsPageClientMock,
  routerPushMock,
  audienceServerDataMock,
  tourDatesMock,
  lazyAudienceMock,
} = vi.hoisted(() => ({
  loadRouteContextMock: vi.fn(),
  contactsPageClientMock: vi.fn(),
  routerPushMock: vi.fn(),
  audienceServerDataMock: vi.fn(),
  tourDatesMock: vi.fn(),
  lazyAudienceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadRouteContextMock,
}));

vi.mock('@/app/app/(shell)/dashboard/audience/audience-data', () => ({
  getAudienceServerData: audienceServerDataMock,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadUpcomingTourDates: tourDatesMock,
}));

vi.mock(
  '@/components/features/dashboard/organisms/LazyDashboardAudienceClient',
  () => ({
    LazyDashboardAudienceClient: (props: unknown) => {
      lazyAudienceMock(props);
      return <div>Audience client</div>;
    },
  })
);

vi.mock('@/app/app/(shell)/contacts/ContactsPageClient', () => ({
  ContactsPageClient: (props: unknown) => {
    contactsPageClientMock(props);
    return <div>Contacts workspace</div>;
  },
}));

vi.mock('@/components/organisms/table/molecules/PageToolbar', () => ({
  PageToolbar: ({ start }: { start: ReactNode }) => <div>{start}</div>,
}));

import ContactsPage, {
  resolveContactsWorkspaceTab,
} from '@/app/app/(shell)/contacts/page';

const profile = {
  id: 'profile_123',
  displayName: 'Tim White',
  username: 'tim',
  usernameNormalized: 'tim-white',
};

describe('canonical contacts page', () => {
  beforeEach(() => {
    loadRouteContextMock.mockReset();
    contactsPageClientMock.mockReset();
    routerPushMock.mockReset();
    audienceServerDataMock.mockReset();
    tourDatesMock.mockReset();
    lazyAudienceMock.mockReset();
    tourDatesMock.mockResolvedValue([]);
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: profile.id,
      dashboardData: { selectedProfile: profile, user: { id: 'user_1' } },
    });
  });

  it('renders without blocking on the contacts query', async () => {
    const user = userEvent.setup();
    render(await ContactsPage());

    expect(loadRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.CONTACTS,
      dashboardErrorLogMessage: 'Dashboard data load failed on contacts page',
      dashboardErrorMessage:
        'Failed to load contacts. Please refresh the page.',
    });
    expect(contactsPageClientMock).toHaveBeenCalledWith({
      profileId: profile.id,
      artistName: profile.displayName,
      artistHandle: profile.usernameNormalized,
    });
    expect(screen.getByText('Contacts workspace')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contacts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.click(screen.getByRole('tab', { name: 'Audience' }));
    expect(routerPushMock).toHaveBeenCalledWith(
      `${APP_ROUTES.CONTACTS}?tab=audience`
    );
    await user.click(screen.getByRole('tab', { name: 'Insights' }));
    expect(routerPushMock).toHaveBeenCalledWith(APP_ROUTES.INSIGHTS);
  });

  it('normalizes workspace state and preserves audience filters in the tab URL', async () => {
    const user = userEvent.setup();
    expect(resolveContactsWorkspaceTab('audience')).toBe('audience');
    expect(resolveContactsWorkspaceTab('other')).toBe('contacts');

    render(
      await ContactsPage({
        searchParams: Promise.resolve({ q: 'berlin', page: '2' }),
      })
    );

    await user.click(screen.getByRole('tab', { name: 'Audience' }));
    expect(routerPushMock).toHaveBeenCalledWith(
      `${APP_ROUTES.CONTACTS}?q=berlin&page=2&tab=audience`
    );
  });

  it('renders the shared route-context error', async () => {
    loadRouteContextMock.mockResolvedValue({
      ok: false,
      error: <div>Route error</div>,
    });

    render(await ContactsPage());

    expect(screen.getByText('Route error')).toBeInTheDocument();
    expect(contactsPageClientMock).not.toHaveBeenCalled();
  });

  // Async server components nested under Suspense don't resolve under RTL;
  // resolve the inner workspace the way release-tasks-page.test.tsx does.
  async function resolveAudienceWorkspace() {
    const tree = await ContactsPage({
      searchParams: Promise.resolve({ tab: 'audience' }),
    });
    const contentRegion = (tree as ReactElement).props.children;
    const suspense = contentRegion.props.children;
    const inner = suspense.props.children;
    return inner.type(inner.props) as Promise<ReactElement>;
  }

  it('renders the audience workspace from the bounded server read', async () => {
    audienceServerDataMock.mockResolvedValue({
      mode: 'members',
      view: 'all',
      rows: [],
      total: 0,
      page: 1,
      pageSize: 25,
      sort: 'lastSeen',
      direction: 'desc',
      subscriberCount: 0,
      totalAudienceCount: 0,
    });

    render(await resolveAudienceWorkspace());

    expect(screen.getByText('Audience client')).toBeInTheDocument();
    expect(audienceServerDataMock).toHaveBeenCalledOnce();
  });

  it('fails visibly when no artist profile is available', async () => {
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: null,
      dashboardData: { selectedProfile: null },
    });

    render(await ContactsPage());

    expect(
      screen.getByText(
        'Unable to load your artist profile. Please refresh the page.'
      )
    ).toBeInTheDocument();
    expect(contactsPageClientMock).not.toHaveBeenCalled();
  });
});
