import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CreatorProfileTableRow,
  type CreatorProfileTableRowProps,
} from './CreatorProfileTableRow';

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn(async () => true),
}));

const profile: AdminCreatorProfileRow = {
  id: 'creator_1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice Artist',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [],
};

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <table>
          <tbody>{children}</tbody>
        </table>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function renderRow(overrides: Partial<CreatorProfileTableRowProps> = {}) {
  const props: CreatorProfileTableRowProps = {
    profile,
    rowNumber: 1,
    isSelected: false,
    isChecked: false,
    isMobile: false,
    verificationStatus: 'idle',
    refreshIngestStatus: 'idle',
    isMenuOpen: false,
    onRowClick: vi.fn(),
    onContextMenu: vi.fn(),
    onToggleSelect: vi.fn(),
    onMenuOpenChange: vi.fn(),
    onRefreshIngest: vi.fn(),
    onToggleVerification: vi.fn(async () => undefined),
    onToggleFeatured: vi.fn(async () => undefined),
    onToggleMarketing: vi.fn(async () => undefined),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(
    <Shell>
      <CreatorProfileTableRow {...props} />
    </Shell>
  );
  return { ...view, props };
}

describe('CreatorProfileTableRow certificate', () => {
  it('opens the row by click and Enter, and selects it by checkbox only', async () => {
    const user = userEvent.setup();
    const { container, props } = renderRow();

    await user.click(screen.getByText('Alice Artist'));
    expect(props.onRowClick).toHaveBeenCalledWith('creator_1');

    screen.getAllByRole('row')[0]?.focus();
    await user.keyboard('{Enter}');
    expect(props.onRowClick).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('checkbox', { name: 'Select alice' }));
    expect(props.onToggleSelect).toHaveBeenCalledWith('creator_1');
    expect(props.onRowClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('links the public profile without opening the row', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();

    const link = screen.getByRole('link', { name: '@alice' });
    expect(link).toHaveAttribute('href', '/alice');
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(props.onRowClick).not.toHaveBeenCalled();
  });

  it('keeps loading and failed action states axe-clean', async () => {
    const { container, rerender, props } = renderRow({
      verificationStatus: 'loading',
      refreshIngestStatus: 'loading',
    });
    await expectNoA11yViolations(container);

    rerender(
      <Shell>
        <CreatorProfileTableRow
          {...props}
          profile={{
            ...profile,
            ingestionStatus: 'failed',
            lastIngestionError: 'Spotify rate limited the refresh',
          }}
          verificationStatus='error'
          refreshIngestStatus='error'
        />
      </Shell>
    );
    expect(screen.getByText('Alice Artist')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows a dash for a missing join date and the handle as the name', async () => {
    const { container } = renderRow({
      profile: {
        ...profile,
        displayName: null,
        createdAt: null,
        socialLinks: [],
      },
    });

    expect(screen.getByRole('link', { name: '@alice' })).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('keeps a long, checked RTL row axe-clean', async () => {
    const long = 'The Extraordinarily Long Named Orchestra and Friends';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Shell>
          <CreatorProfileTableRow
            profile={{
              ...profile,
              displayName: long,
              username: 'the-extraordinarily-long-named-orchestra',
              isVerified: true,
              isFeatured: true,
            }}
            rowNumber={1234}
            isSelected
            isChecked
            isMobile={false}
            verificationStatus='success'
            refreshIngestStatus='success'
            isMenuOpen={false}
            onRowClick={vi.fn()}
            onContextMenu={vi.fn()}
            onToggleSelect={vi.fn()}
            onMenuOpenChange={vi.fn()}
            onRefreshIngest={vi.fn()}
            onToggleVerification={vi.fn(async () => undefined)}
            onToggleFeatured={vi.fn(async () => undefined)}
            onToggleMarketing={vi.fn(async () => undefined)}
            onDelete={vi.fn()}
          />
        </Shell>
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Select the-extraordinarily-long-named-orchestra',
      })
    ).toBeChecked();
    await expectNoA11yViolations(container);
  });
});
