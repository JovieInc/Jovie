import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { loadRouteContextMock, contactsPageClientMock, routerPushMock } =
  vi.hoisted(() => ({
    loadRouteContextMock: vi.fn(),
    contactsPageClientMock: vi.fn(),
    routerPushMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadRouteContextMock,
}));

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
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: profile.id,
      dashboardData: { selectedProfile: profile },
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
