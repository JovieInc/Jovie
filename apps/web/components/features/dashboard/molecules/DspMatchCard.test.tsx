import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspMatchCard, type DspMatchCardProps } from './DspMatchCard';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role='img' aria-label={alt} />,
}));

const breakdown = {
  isrcMatchScore: 0.95,
  upcMatchScore: 0.9,
  nameSimilarityScore: 0.98,
  followerRatioScore: 0.8,
  genreOverlapScore: 0.85,
};

function card(overrides: Partial<DspMatchCardProps> = {}) {
  return (
    <DspMatchCard
      matchId='match-1'
      providerId='apple_music'
      externalArtistName='Sasha Waves'
      externalArtistUrl='https://music.apple.com/artist/sasha-waves'
      confidenceScore={0.92}
      matchingIsrcCount={12}
      status='suggested'
      onConfirm={vi.fn()}
      onReject={vi.fn()}
      {...overrides}
    />
  );
}

describe('DspMatchCard', () => {
  it('confirms and rejects the match by id and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onReject = vi.fn();
    const { container } = render(card({ onConfirm, onReject }));
    await user.click(screen.getByRole('button', { name: 'Confirm Match' }));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onConfirm).toHaveBeenCalledWith('match-1');
    expect(onReject).toHaveBeenCalledWith('match-1');
    await expectNoA11yViolations(container);
  });

  it('expands the confidence breakdown and reports the expanded state', async () => {
    const user = userEvent.setup();
    const { container } = render(card({ confidenceBreakdown: breakdown }));
    const toggle = screen.getByRole('button', { name: /Confidence breakdown/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('data-slot', 'plain-button');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('disables both actions and relabels while a decision is in flight', async () => {
    const { container, rerender } = render(card({ isRejecting: true }));
    expect(screen.getByRole('button', { name: 'Rejecting...' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Confirm Match' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
    rerender(card({ isConfirming: true }));
    expect(
      screen.getByRole('button', { name: 'Confirming...' })
    ).toBeDisabled();
  });

  it('hides the actions once the match is not suggested and without a link', async () => {
    const { container } = render(
      card({ status: 'confirmed', externalArtistUrl: null })
    );
    expect(screen.queryByRole('button', { name: 'Confirm Match' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('flattens the action chrome onto a ring instead of a nested border', () => {
    render(card());
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass(
      'ring-1',
      'ring-subtle'
    );
  });

  it('renders zero matches, long names and right-to-left names axe-clean', async () => {
    const empty = render(card({ matchingIsrcCount: 0, confidenceScore: 0.1 }));
    expect(screen.getByText('0 ISRC matches')).toBeVisible();
    await expectNoA11yViolations(empty.container);
    empty.unmount();
    const long = render(
      card({
        externalArtistName:
          'The Extraordinarily Long Named Midnight Orchestra Featuring Many Special Guests',
      })
    );
    await expectNoA11yViolations(long.container);
    long.unmount();
    const rtl = render(card({ externalArtistName: 'فرقة منتصف الليل' }));
    expect(screen.getByText('فرقة منتصف الليل')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
