import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ConfirmMatchDialog } from './ConfirmMatchDialog';

const matchData = {
  matchId: 'match-1',
  providerId: 'apple_music' as const,
  externalArtistName: 'Nova Lane',
  externalArtistUrl: 'https://music.apple.com/artist/nova-lane',
  confidenceScore: 0.92,
  confidenceBreakdown: {
    isrcMatchScore: 0.9,
    upcMatchScore: 0.8,
    nameSimilarityScore: 1,
    followerRatioScore: 0.7,
    genreOverlapScore: 0.6,
  },
  matchingIsrcCount: 15,
};

describe('ConfirmMatchDialog', () => {
  it('renders nothing without match data', () => {
    const { container } = render(
      <ConfirmMatchDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        matchData={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the match, confirms and cancels', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmMatchDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        matchData={matchData}
      />
    );

    expect(await screen.findByText('Confirm artist match')).toBeInTheDocument();
    expect(screen.getByText('Nova Lane')).toBeInTheDocument();
    expect(screen.getByText('15 matching ISRCs')).toBeInTheDocument();
    expect(screen.getByText('Match Confidence Breakdown')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await expectNoA11yViolations(document.body);
  });

  it('disables confirm while confirming and hides optional parts', async () => {
    render(
      <ConfirmMatchDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isConfirming
        matchData={{
          ...matchData,
          externalArtistUrl: null,
          confidenceBreakdown: undefined,
        }}
      />
    );

    expect(
      await screen.findByRole('button', { name: /Confirming/ })
    ).toBeDisabled();
    expect(
      screen.queryByText('Match Confidence Breakdown')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });
});
