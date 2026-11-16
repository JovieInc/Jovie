import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/feedback', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/feedback')>()),
  toast: { error: toastError, success: toastSuccess, info: vi.fn() },
}));

vi.mock('@/features/dashboard/molecules/EmailSignatureDialog', () => ({
  EmailSignatureDialog: () => null,
}));

vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app/ov/people',
  useSearchParams: () => new URLSearchParams(),
}));

function creator(
  id: string,
  displayName: string,
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id,
    username: id,
    usernameNormalized: id,
    displayName,
    avatarUrl: null,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    location: null,
    hometown: null,
    activeSinceYear: null,
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    confidence: 0,
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
    ...overrides,
  };
}

function renderTable(rows: AdminCreatorProfileRow[], search = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RightPanelProvider>
          <AdminCreatorProfilesUnified
            profiles={rows}
            page={1}
            pageSize={25}
            total={rows.length}
            search={search}
            sort='created_desc'
          />
        </RightPanelProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
  return { ...result, client };
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe('AdminCreatorProfilesUnified certificate', () => {
  it('renders the default rows without a11y violations', async () => {
    const { container, client } = renderTable([
      creator('ari', 'Ari Lane'),
      creator('sam', 'Sam Rivers'),
    ]);
    expect(await screen.findByText('Ari Lane')).toBeVisible();
    expect(screen.getByText('Sam Rivers')).toBeVisible();
    expect(screen.getByText(/Showing 1–2 of 2 profiles/)).toBeVisible();
    await expectNoA11yViolations(container);
    client.clear();
  });

  it('renders the empty state without a11y violations', async () => {
    const { container, client } = renderTable([], 'nobody');
    expect(await screen.findByText('No creator profiles found')).toBeVisible();
    await expectNoA11yViolations(container);
    client.clear();
  });

  it('raises a failure toast when a row action request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'unavailable' }, { status: 503 })
      )
    );
    const user = userEvent.setup({ delay: null });
    const { container, client } = renderTable([
      creator('signalbloom', 'Signal Bloom'),
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'More actions' })
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Verify Creator' })
    );

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to verify creator')
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
    client.clear();
  });

  it('keeps long names and handles readable without a11y violations', async () => {
    const longName =
      'The Extraordinarily Long Named Orchestra Of The Northern Hemisphere';
    const { container, client } = renderTable([
      creator('theextraordinarilylongnamedorchestra', longName),
      creator('a', 'A'),
    ]);
    const person = (await screen.findByText(longName)).closest(
      '[data-table-person-cell]'
    );
    expect(person).not.toBeNull();
    expect(
      within(person as HTMLElement).getByText(
        '@theextraordinarilylongnamedorchestra'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    client.clear();
  });

  it('renders right-to-left names without a11y violations', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <RightPanelProvider>
              <AdminCreatorProfilesUnified
                profiles={[creator('layla', 'ليلى الموسيقية')]}
                page={1}
                pageSize={25}
                total={1}
                search=''
                sort='created_desc'
              />
            </RightPanelProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </div>
    );
    expect(await screen.findByText('ليلى الموسيقية')).toBeVisible();
    await expectNoA11yViolations(container);
    client.clear();
  });
});
