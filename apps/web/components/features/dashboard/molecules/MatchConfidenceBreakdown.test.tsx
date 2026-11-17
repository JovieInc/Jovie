import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MatchConfidenceBreakdown } from './MatchConfidenceBreakdown';

const LOW_CONFIDENCE_BREAKDOWN = {
  isrcMatchScore: 0.1,
  upcMatchScore: 0.05,
  nameSimilarityScore: 0.4,
  followerRatioScore: 0.2,
  genreOverlapScore: 0.15,
};

describe('MatchConfidenceBreakdown', () => {
  it('renders a low total score with the error token, not raw red-* (JOV-6773)', () => {
    render(
      <MatchConfidenceBreakdown
        breakdown={LOW_CONFIDENCE_BREAKDOWN}
        totalScore={0.2}
      />
    );

    const total = screen.getByText('Total Confidence').nextElementSibling;
    expect(total?.className).toContain('text-error');
    expect(total?.className).not.toMatch(/\bred-\d/);
  });

  it('renders a high total score with the success token', () => {
    render(
      <MatchConfidenceBreakdown
        breakdown={{
          isrcMatchScore: 0.95,
          upcMatchScore: 0.9,
          nameSimilarityScore: 0.98,
          followerRatioScore: 0.8,
          genreOverlapScore: 0.85,
        }}
        totalScore={0.92}
      />
    );

    const total = screen.getByText('Total Confidence').nextElementSibling;
    expect(total?.className).toContain('text-success');
  });

  it('paints a medium score with the warning tokens, not raw amber-*', async () => {
    const { container } = render(
      <MatchConfidenceBreakdown
        breakdown={{
          isrcMatchScore: 0.6,
          upcMatchScore: 0.5,
          nameSimilarityScore: 0.7,
          followerRatioScore: 0.4,
          genreOverlapScore: 0.5,
        }}
        totalScore={0.58}
      />
    );

    const total = screen.getByText('58%');
    expect(total).toHaveClass('text-warning-text');
    expect(screen.getByText('+30%')).toHaveClass('text-success');
    expect(screen.getByText('+10%')).toHaveClass('text-success');
    expect(container.innerHTML).not.toMatch(/\b(amber|green)-\d/);
    expect(container.querySelector('.bg-warning')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('fills high bars with the success token and empty bars at 0%', async () => {
    const { container } = render(
      <MatchConfidenceBreakdown
        breakdown={{
          isrcMatchScore: 0.9,
          upcMatchScore: 0,
          nameSimilarityScore: 0,
          followerRatioScore: 0,
          genreOverlapScore: 0,
        }}
        totalScore={0.45}
      />
    );
    const bars = container.querySelectorAll<HTMLElement>(
      '.h-full.rounded-full'
    );
    expect(bars).toHaveLength(5);
    expect(bars[0]).toHaveClass('bg-success');
    expect(bars[0].style.width).toBe('90%');
    expect(bars[1].style.width).toBe('0%');
    expect(screen.getByText('45%')).toHaveClass('text-error');
    await expectNoA11yViolations(container);
  });

  it('renders right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MatchConfidenceBreakdown
          breakdown={LOW_CONFIDENCE_BREAKDOWN}
          totalScore={0.2}
        />
      </div>
    );
    expect(screen.getByText('ISRC Matches')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
