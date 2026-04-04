import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesEmptyState } from '@/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  DrawerSurfaceCard: ({
    children,
    testId,
  }: {
    children: ReactNode;
    testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
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
      screen.getByText('We had trouble finding your music')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetryEnrichment).toHaveBeenCalledTimes(1);
  });
});
