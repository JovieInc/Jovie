import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ConfirmMatchDialog,
  type ConfirmMatchDialogProps,
} from './ConfirmMatchDialog';

const matchData: NonNullable<ConfirmMatchDialogProps['matchData']> = {
  matchId: 'match-1',
  providerId: 'apple_music',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/artist/sasha-waves',
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  confidenceBreakdown: {
    isrcMatchScore: 0.95,
    upcMatchScore: 0.8,
    nameSimilarityScore: 1,
    followerRatioScore: 0.7,
    genreOverlapScore: 0.6,
  },
  matchingIsrcCount: 15,
};

function renderDialog(overrides: Partial<ConfirmMatchDialogProps> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const view = render(
    <ConfirmMatchDialog
      open
      onClose={onClose}
      onConfirm={onConfirm}
      matchData={matchData}
      {...overrides}
    />
  );
  return { ...view, onClose, onConfirm };
}

describe('ConfirmMatchDialog', () => {
  it('confirms or cancels from the actions and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { onClose, onConfirm } = renderDialog();

    expect(screen.getByText('Sasha Waves')).toBeInTheDocument();
    expect(screen.getByText('15 matching ISRCs')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open Sasha Waves on/ })
    ).toHaveAttribute('href', matchData.externalArtistUrl);
    await expectNoA11yViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks Confirm while confirming', () => {
    renderDialog({ isConfirming: true });

    expect(screen.getByRole('button', { name: /Confirming/ })).toBeDisabled();
  });

  it('renders nothing without a match', () => {
    renderDialog({ matchData: null });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('omits the artist link and breakdown when they are missing', async () => {
    renderDialog({
      matchData: {
        ...matchData,
        externalArtistUrl: null,
        confidenceBreakdown: undefined,
      },
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Match Confidence Breakdown')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('shows the info note with neutral tokens, not palette colours', () => {
    renderDialog();

    const note = screen.getByText(/Once confirmed/);
    expect(note.className).toContain('text-secondary-token');
    expect(document.body.innerHTML).not.toMatch(/sky-\d{3}/);
  });
});
