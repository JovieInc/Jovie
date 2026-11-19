import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleasesEmptyState } from './ReleasesEmptyState';

describe('ReleasesEmptyState certificate', () => {
  it('offers to connect Spotify when nothing is connected', async () => {
    const user = userEvent.setup();
    const onConnectSpotify = vi.fn();
    const onRetryEnrichment = vi.fn();
    const { container } = render(
      <ReleasesEmptyState
        onConnectSpotify={onConnectSpotify}
        onRetryEnrichment={onRetryEnrichment}
      />
    );

    expect(
      screen.getByTestId('releases-empty-state-disconnected')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Connect Spotify' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Search your artist profile to import releases.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Connect Spotify' }));
    expect(onConnectSpotify).toHaveBeenCalledTimes(1);
    expect(onRetryEnrichment).not.toHaveBeenCalled();
  });

  it('shows progress without an action while enriching', async () => {
    const { container } = render(
      <ReleasesEmptyState
        onConnectSpotify={vi.fn()}
        onRetryEnrichment={vi.fn()}
        enrichmentStatus='enriching'
      />
    );

    expect(
      screen.getByTestId('releases-empty-state-enriching')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Finding Your Music' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each([
    ['partial', 'Some Music Found', 'releases-empty-state-partial'],
    ['failed', 'Music Search Failed', 'releases-empty-state-failed'],
  ] as const)('retries a %s search', async (status, heading, testId) => {
    const user = userEvent.setup();
    const onConnectSpotify = vi.fn();
    const onRetryEnrichment = vi.fn();
    const { container } = render(
      <ReleasesEmptyState
        onConnectSpotify={onConnectSpotify}
        onRetryEnrichment={onRetryEnrichment}
        enrichmentStatus={status}
      />
    );

    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetryEnrichment).toHaveBeenCalledTimes(1);
    expect(onConnectSpotify).not.toHaveBeenCalled();
  });

  it.each(['partial', 'failed'] as const)(
    'shows no action for a %s search without a retry handler',
    status => {
      render(
        <ReleasesEmptyState
          onConnectSpotify={vi.fn()}
          enrichmentStatus={status}
        />
      );

      expect(screen.queryByRole('button')).toBeNull();
    }
  );
});
