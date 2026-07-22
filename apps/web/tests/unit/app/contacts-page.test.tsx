import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const {
  captureErrorMock,
  getContactsMock,
  loadRouteContextMock,
  contactsManagerMock,
} = vi.hoisted(() => ({
  captureErrorMock: vi.fn(),
  getContactsMock: vi.fn(),
  loadRouteContextMock: vi.fn(),
  contactsManagerMock: vi.fn(),
}));

vi.mock('@/app/app/(shell)/app-shell-route-context', () => ({
  loadAppShellRouteContext: loadRouteContextMock,
}));

vi.mock('@/app/app/(shell)/dashboard/contacts/actions', () => ({
  getProfileContactsForOwner: getContactsMock,
}));

vi.mock('@/features/dashboard/organisms/ContactsManager', () => ({
  ContactsManager: (props: unknown) => {
    contactsManagerMock(props);
    return <div>Contacts workspace</div>;
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: captureErrorMock,
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
    captureErrorMock.mockReset();
    getContactsMock.mockReset();
    loadRouteContextMock.mockReset();
    contactsManagerMock.mockReset();
    loadRouteContextMock.mockResolvedValue({
      ok: true,
      profileId: profile.id,
      dashboardData: { selectedProfile: profile },
    });
  });

  it('renders the real table workspace without redirecting through Settings', async () => {
    const contacts = [{ id: 'contact_1', role: 'bookings' }];
    getContactsMock.mockResolvedValue(contacts);

    render(await ContactsPage());

    expect(loadRouteContextMock).toHaveBeenCalledWith({
      route: APP_ROUTES.CONTACTS,
      dashboardErrorLogMessage: 'Dashboard data load failed on contacts page',
      dashboardErrorMessage:
        'Failed to load contacts. Please refresh the page.',
    });
    expect(getContactsMock).toHaveBeenCalledWith(profile.id);
    expect(contactsManagerMock).toHaveBeenCalledWith({
      profileId: profile.id,
      artistName: profile.displayName,
      artistHandle: profile.usernameNormalized,
      initialContacts: contacts,
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
    expect(getContactsMock).not.toHaveBeenCalled();
  });

  it('renders a stable error state when contact loading fails', async () => {
    const error = new Error('contacts unavailable');
    getContactsMock.mockRejectedValue(error);

    render(await ContactsPage());

    expect(
      screen.getByText('Failed to load contacts. Please refresh the page.')
    ).toBeInTheDocument();
    expect(captureErrorMock).toHaveBeenCalledWith(
      'Contacts load failed on contacts page',
      error,
      { route: APP_ROUTES.CONTACTS, profileId: profile.id }
    );
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
    expect(getContactsMock).not.toHaveBeenCalled();
  });
});
