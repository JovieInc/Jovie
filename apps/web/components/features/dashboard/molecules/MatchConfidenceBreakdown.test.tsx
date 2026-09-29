import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
