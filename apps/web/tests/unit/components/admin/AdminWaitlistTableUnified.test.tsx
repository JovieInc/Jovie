import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminWaitlistTableUnified } from '@/features/admin/waitlist-table/AdminWaitlistTableUnified';

let capturedGetRowClassName:
  | ((row: unknown, index: number) => string)
  | undefined;

vi.mock('@/features/admin/table/AdminDataTable', () => ({
  AdminDataTable: ({
    children,
    emptyState,
    getRowClassName,
  }: {
    readonly children?: ReactNode;
    readonly emptyState?: ReactNode;
    readonly getRowClassName?: (row: unknown, index: number) => string;
  }) => {
    capturedGetRowClassName = getRowClassName;

    return (
      <div data-testid='admin-data-table'>
        {children}
        <div data-testid='waitlist-empty-state'>{emptyState}</div>
      </div>
    );
  },
}));

vi.mock('@/components/organisms/table', () => ({
  useRowSelection: () => ({
    selectedIds: new Set<string>(),
    headerCheckboxState: false,
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
  }),
}));

vi.mock('@/features/admin/waitlist-table/useApproveEntry', () => ({
  useApproveEntry: () => ({
    approveEntry: vi.fn().mockResolvedValue(undefined),
    resendInvite: vi.fn().mockResolvedValue(undefined),
  }),
}));

const entry = {
  id: 'waitlist_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: null,
  primarySocialUrl: 'https://instagram.com/ari',
  primarySocialPlatform: 'instagram',
  primarySocialUrlNormalized: 'https://instagram.com/ari',
  spotifyUrl: null,
  spotifyUrlNormalized: null,
  spotifyArtistName: null,
  heardAbout: null,
  status: 'new' as const,
  primarySocialFollowerCount: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
};

describe('AdminWaitlistTableUnified', () => {
  it('relies on canonical shell row primitives (no custom getRowClassName override) and shell-colored empty state chrome', () => {
    render(
      <AdminWaitlistTableUnified
        entries={[entry]}
        page={1}
        pageSize={20}
        total={1}
      />
    );

    // Converged: no explicit getRowClassName; presets.tableRow + rowState provide hover
    expect(capturedGetRowClassName).toBeUndefined();

    expect(screen.getByText('No waitlist entries').className).toContain(
      'text-primary-token'
    );
    expect(
      screen.getByText('New waitlist signups will appear here.').className
    ).toContain('text-secondary-token');
    expect(
      screen.getByTestId('waitlist-empty-state').querySelector('svg')
    ).not.toBeNull();
    expect(
      screen
        .getByTestId('waitlist-empty-state')
        .querySelector('svg')
        ?.getAttribute('class') ?? ''
    ).toContain('text-tertiary-token');
  });
});
