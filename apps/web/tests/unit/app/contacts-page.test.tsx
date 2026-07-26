import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { loadRouteContextMock, contactsPageClientMock } = vi.hoisted(() => ({
  loadRouteContextMock: vi.fn(),
  contactsPageClientMock: vi.fn(),
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

import ContactsPage from '@/app/app/(shell)/contacts/page';

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
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: profile.id,
      dashboardData: { selectedProfile: profile },
    });
  });

  it('renders without blocking on the contacts query', async () => {
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
