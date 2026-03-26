import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DspMatchCard } from '@/features/dashboard/molecules/DspMatchCard';
import { ConfirmMatchDialog } from '@/features/dashboard/organisms/dsp-matches/ConfirmMatchDialog';

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/features/dashboard/atoms/ConfidenceBadge', () => ({
  ConfidenceBadge: ({
    score,
    showLabel,
  }: {
    score: number;
    showLabel?: boolean;
  }) => <span>{showLabel ? `Confidence ${score}` : `Score ${score}`}</span>,
}));

vi.mock('@/features/dashboard/atoms/MatchStatusBadge', () => ({
  MatchStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock('@/features/dashboard/atoms/DspProviderIcon', () => ({
  PROVIDER_LABELS: { spotify: 'Spotify' },
  DspProviderIcon: ({
    provider,
    showLabel,
  }: {
    provider: string;
    showLabel?: boolean;
  }) => <span>{showLabel ? `${provider}-label` : provider}</span>,
}));

vi.mock('@/features/dashboard/molecules/MatchConfidenceBreakdown', () => ({
  MatchConfidenceBreakdown: () => <div>confidence-breakdown</div>,
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

describe('DSP match surfaces', () => {
  it('renders the match card and toggles the confidence breakdown', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();

    render(
      <DspMatchCard
        matchId='match-1'
        providerId='spotify'
        externalArtistName='Midnight Echo'
        externalArtistUrl='https://open.spotify.com/artist/123'
        confidenceScore={0.92}
        confidenceBreakdown={{
          isrcMatchScore: 1,
          upcMatchScore: 0.5,
          nameSimilarityScore: 0.8,
          followerRatioScore: 0.3,
          genreOverlapScore: 0.4,
        }}
        matchingIsrcCount={12}
        status='suggested'
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );

    expect(screen.getByText('Midnight Echo')).toBeInTheDocument();
    expect(screen.getByText('12 ISRC matches')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Confidence breakdown/i })
    );
    expect(screen.getByText('confidence-breakdown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));

    expect(onReject).toHaveBeenCalledWith('match-1');
    expect(onConfirm).toHaveBeenCalledWith('match-1');
  });

  it('renders the confirm dialog preview and actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmMatchDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        matchData={{
          matchId: 'match-1',
          providerId: 'spotify',
          externalArtistName: 'Midnight Echo',
          externalArtistUrl: 'https://open.spotify.com/artist/123',
          confidenceScore: 0.92,
          confidenceBreakdown: {
            isrcMatchScore: 1,
            upcMatchScore: 0.5,
            nameSimilarityScore: 0.8,
            followerRatioScore: 0.3,
            genreOverlapScore: 0.4,
          },
          matchingIsrcCount: 9,
        }}
      />
    );

    expect(screen.getByText('Confirm artist match')).toBeInTheDocument();
    expect(screen.getByText('Midnight Echo')).toBeInTheDocument();
    expect(screen.getByText('9 matching ISRCs')).toBeInTheDocument();
    expect(screen.getAllByText('confidence-breakdown').length).toBeGreaterThan(
      0
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
