import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReleasesEmptyState } from '@/components/features/dashboard/organisms/release-provider-matrix/ReleasesEmptyState';

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
    expect(state).toHaveClass('bg-(--app-shell-content-surface)');
    expect(state).not.toHaveAttribute('data-variant', 'card');
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-content-state',
      'empty'
    );
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-empty-state-presentation',
      'workspace'
    );
    expect(
      screen.getByRole('heading', { name: 'Some Music Found' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled();
  });
});
