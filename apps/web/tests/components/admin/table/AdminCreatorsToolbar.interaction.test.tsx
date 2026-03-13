import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCreatorsToolbar } from '@/components/admin/table/AdminCreatorsToolbar';
import { TableMetaProvider } from '@/components/organisms/AuthShellWrapper';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/organisms/table', () => ({
  PAGE_TOOLBAR_META_TEXT_CLASS: 'page-toolbar-meta-text',
  PageToolbar: ({ start, end }: { start: ReactNode; end?: ReactNode }) => (
    <div>
      {start}
      {end}
    </div>
  ),
  PageToolbarActionButton: ({
    label,
    ariaLabel,
  }: {
    label: ReactNode;
    ariaLabel: string;
  }) => (
    <button type='button' aria-label={ariaLabel}>
      {label}
    </button>
  ),
  PageToolbarSearchForm: ({ submitAriaLabel }: { submitAriaLabel: string }) => (
    <button type='submit'>{submitAriaLabel}</button>
  ),
  ExportCSVButton: ({ disabled }: { disabled: boolean }) => (
    <button type='button' disabled={disabled}>
      Export
    </button>
  ),
}));

function createProfile(
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id: 'creator-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
    ...overrides,
  };
}

function renderToolbar(
  props: Partial<React.ComponentProps<typeof AdminCreatorsToolbar>> = {}
) {
  const handlers = {
    onBulkVerify: vi.fn(),
    onBulkUnverify: vi.fn(),
    onBulkFeature: vi.fn(),
    onBulkRefreshMusicFetch: vi.fn(),
    onBulkDelete: vi.fn(),
    onClearSelection: vi.fn(),
  };

  render(
    <TooltipProvider>
      <TableMetaProvider>
        <AdminCreatorsToolbar
          basePath='/admin/creators'
          search=''
          sort='newest'
          pageSize={20}
          from={1}
          to={2}
          total={2}
          clearHref='/admin/creators'
          profiles={[createProfile(), createProfile({ id: 'creator-2' })]}
          {...handlers}
          {...props}
        />
      </TableMetaProvider>
    </TooltipProvider>
  );

  return handlers;
}

describe('AdminCreatorsToolbar interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows selected count and bulk actions when rows are selected', () => {
    renderToolbar({ selectedIds: new Set(['creator-1', 'creator-2']) });

    expect(screen.getByText('2 creators selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feature' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh Music Data' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('switches verify action to unverify when at least one selected creator is already verified', () => {
    renderToolbar({
      profiles: [
        createProfile({ isVerified: true }),
        createProfile({ id: 'creator-2' }),
      ],
      selectedIds: new Set(['creator-1', 'creator-2']),
    });

    expect(
      screen.getByRole('button', { name: 'Unverify' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verify' })
    ).not.toBeInTheDocument();
  });

  it('calls correct action handlers when bulk action buttons are clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const handlers = renderToolbar({ selectedIds: new Set(['creator-1']) });

    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await user.click(screen.getByRole('button', { name: 'Feature' }));
    await user.click(
      screen.getByRole('button', { name: 'Refresh Music Data' })
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Clear Selection' }));

    expect(handlers.onBulkVerify).toHaveBeenCalledTimes(1);
    expect(handlers.onBulkFeature).toHaveBeenCalledTimes(1);
    expect(handlers.onBulkRefreshMusicFetch).toHaveBeenCalledTimes(1);
    expect(handlers.onBulkDelete).toHaveBeenCalledTimes(1);
    expect(handlers.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('renders normal toolbar mode without bulk actions when no rows are selected', () => {
    renderToolbar({ selectedIds: new Set() });

    expect(
      screen.getByRole('button', { name: 'Search creators' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });
});
