import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesEmptyState } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type='button' onClick={onClick} className={className}>
      {children}
    </button>
  ),
  DrawerSurfaceCard: ({
    children,
    testId,
    className,
    variant,
  }: {
    children: ReactNode;
    testId?: string;
    className?: string;
    variant?: string;
  }) => (
    <div data-testid={testId} data-variant={variant} className={className}>
      {children}
    </div>
  ),
}));

describe('ReleasesEmptyState', () => {
  it('renders the disconnected state and wires connect action', async () => {
    const user = userEvent.setup();
    const onConnectSpotify = vi.fn();

    render(<ReleasesEmptyState onConnectSpotify={onConnectSpotify} />);

    expect(
      screen.getByTestId('releases-empty-state-disconnected')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Connect Spotify' }));

    expect(onConnectSpotify).toHaveBeenCalledTimes(1);
  });

  it('renders the enrichment failure state with retry action', async () => {
    const user = userEvent.setup();
    const onRetryEnrichment = vi.fn();

    render(
      <ReleasesEmptyState
        onConnectSpotify={vi.fn()}
        enrichmentStatus='failed'
        onRetryEnrichment={onRetryEnrichment}
      />
    );

    expect(
      screen.getByTestId('releases-empty-state-failed')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Music Search Failed' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(onRetryEnrichment).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical table empty-state surface for release search outcomes', () => {
    render(
      <ReleasesEmptyState
        onConnectSpotify={vi.fn()}
        enrichmentStatus='partial'
        onRetryEnrichment={vi.fn()}
      />
    );

    const state = screen.getByTestId('releases-empty-state-partial');
    expect(state).toHaveClass('min-h-55');
    expect(state).toHaveAttribute('data-variant', 'card');
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-content-state',
      'empty'
    );
    expect(
      screen.getByRole('heading', { name: 'Some Music Found' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled();
  });
});
