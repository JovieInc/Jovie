import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { contactsManagerMock, useContactsQueryMock } = vi.hoisted(() => ({
  contactsManagerMock: vi.fn(),
  useContactsQueryMock: vi.fn(),
}));

vi.mock('@/features/dashboard/organisms/ContactsManager', () => ({
  ContactsManager: (props: { readonly isLoading: boolean }) => {
    contactsManagerMock(props);
    return (
      <div
        data-loading={String(props.isLoading)}
        data-testid='contacts-table'
      />
    );
  },
}));

vi.mock('@/lib/queries', () => ({
  useContactsQuery: useContactsQueryMock,
}));

import { ContactsPageClient } from '@/app/app/(shell)/contacts/ContactsPageClient';

const baseProps = {
  profileId: 'profile_123',
  artistName: 'Tim White',
  artistHandle: 'tim-white',
};

describe('ContactsPageClient', () => {
  beforeEach(() => {
    contactsManagerMock.mockReset();
    useContactsQueryMock.mockReset();
  });

  it('renders the stable contacts workspace while its query is pending', () => {
    useContactsQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
      isLoading: true,
    });

    render(<ContactsPageClient {...baseProps} />);

    expect(screen.getByTestId('contacts-table')).toHaveAttribute(
      'data-loading',
      'true'
    );
    expect(useContactsQueryMock).toHaveBeenCalledWith('profile_123');
    expect(contactsManagerMock).toHaveBeenCalledWith({
      ...baseProps,
      initialContacts: [],
      isLoading: true,
    });
  });

  it('hydrates the workspace with client-owned query data', () => {
    const contacts = [{ id: 'contact_1', role: 'bookings' }];
    useContactsQueryMock.mockReturnValue({
      data: contacts,
      isError: false,
      isLoading: false,
    });

    render(<ContactsPageClient {...baseProps} />);

    expect(contactsManagerMock).toHaveBeenCalledWith({
      ...baseProps,
      initialContacts: contacts,
      isLoading: false,
    });
  });

  it('keeps a stable ready surface when contact loading fails', () => {
    useContactsQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
    });

    render(<ContactsPageClient {...baseProps} />);

    expect(screen.getByTestId('contacts-table')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to load contacts. Please refresh the page.')
    ).toBeInTheDocument();
    expect(contactsManagerMock).not.toHaveBeenCalled();
  });

  it('keeps cached contacts visible when a background refetch fails', () => {
    const contacts = [{ id: 'contact_1', role: 'bookings' }];
    useContactsQueryMock.mockReturnValue({
      data: contacts,
      isError: true,
      isLoading: false,
    });

    render(<ContactsPageClient {...baseProps} />);

    expect(contactsManagerMock).toHaveBeenCalledWith({
      ...baseProps,
      initialContacts: contacts,
      isLoading: false,
    });
    expect(
      screen.queryByText('Failed to load contacts. Please refresh the page.')
    ).not.toBeInTheDocument();
  });
});
