import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { DashboardContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import { SettingsContactsSection } from './SettingsContactsSection';

const { queryState, refetch } = vi.hoisted(() => ({
  queryState: {
    data: null as null | DashboardContact[],
    isLoading: false,
    isError: false,
  },
  refetch: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: { usernameNormalized: 'timwhite', username: 'timwhite' },
  }),
}));

vi.mock('@/lib/queries/useContactsQuery', () => ({
  useContactsQuery: () => ({ ...queryState, refetch }),
}));

vi.mock(
  '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar',
  () => ({
    ContactDetailSidebar: ({
      isOpen,
      contact,
    }: {
      isOpen: boolean;
      contact: { role: string } | null;
    }) => (
      <div
        data-testid='contact-detail-sidebar'
        data-open={isOpen}
        data-role={contact?.role ?? ''}
      />
    ),
  })
);

const artist = {
  id: 'profile-1',
  owner_user_id: 'user-1',
  handle: 'timwhite',
  spotify_id: '',
  name: 'Tim White',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

const kelly: DashboardContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: null,
  territories: [],
  email: 'kelly@example.com',
  phone: null,
  preferredChannel: null,
  isActive: true,
  sortOrder: 0,
};

function RightPanelRenderer() {
  return <>{useRightPanel()}</>;
}

function renderSection(dir?: 'rtl') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (children: ReactNode) =>
    dir ? <div dir={dir}>{children}</div> : children;
  return render(
    <QueryClientProvider client={client}>
      <RightPanelProvider>
        {wrap(<SettingsContactsSection artist={artist} />)}
        <RightPanelRenderer />
      </RightPanelProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryState.data = [kelly];
  queryState.isLoading = false;
  queryState.isError = false;
  refetch.mockReset();
});

describe('SettingsContactsSection certificate', () => {
  it('opens the detail sidebar for a clicked contact', async () => {
    const user = userEvent.setup();
    const { container } = renderSection();
    await expectNoA11yViolations(container);

    const row = screen.getByText('Management').closest('button');
    if (!row) throw new TypeError('Expected a contact row button');
    await user.click(row);

    await waitFor(() =>
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-open',
        'true'
      )
    );
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a bookings contact and selects it', async () => {
    const user = userEvent.setup();
    queryState.data = [];
    const { container } = renderSection();

    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Add Contact' }));

    await waitFor(() =>
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-role',
        'bookings'
      )
    );
    expect(screen.queryByText('No contacts yet')).not.toBeInTheDocument();
  });

  it('retries a failed load', async () => {
    const user = userEvent.setup();
    queryState.data = null;
    queryState.isError = true;
    const { container } = renderSection();

    expect(screen.getByText('Unable To Load Contacts')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetch).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('keeps the panel header while loading', async () => {
    queryState.data = null;
    queryState.isLoading = true;
    const { container } = renderSection();

    expect(screen.getByText('Team Contacts')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Contact' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders long names and an RTL list', async () => {
    const longName =
      'Alexandria Montgomery-Fitzgerald the Third of Westminster';
    queryState.data = [{ ...kelly, personName: longName }];
    const long = renderSection();
    expect(screen.getByText(longName, { exact: false })).toBeInTheDocument();
    await expectNoA11yViolations(long.container);
    long.unmount();

    queryState.data = [{ ...kelly, personName: 'كيلي ستريكلاند' }];
    const rtl = renderSection('rtl');
    expect(
      screen.getByText('كيلي ستريكلاند', { exact: false })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
