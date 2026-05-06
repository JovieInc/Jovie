import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceEngagementBars } from '@/components/features/dashboard/organisms/dashboard-audience-table/cells';

describe('AudienceEngagementBars', () => {
  it('renders 0 of 5 when score is 0', () => {
    render(<AudienceEngagementBars score={0} />);
    expect(screen.getByLabelText('Engagement 0 of 5')).toBeInTheDocument();
  });

  it('renders at least 1 bar for any non-zero score', () => {
    render(<AudienceEngagementBars score={1} />);
    expect(screen.getByLabelText('Engagement 1 of 5')).toBeInTheDocument();
  });

  it('renders 5 of 5 for max score', () => {
    render(<AudienceEngagementBars score={100} />);
    expect(screen.getByLabelText('Engagement 5 of 5')).toBeInTheDocument();
  });

  it('clamps score above 100', () => {
    render(<AudienceEngagementBars score={250} />);
    expect(screen.getByLabelText('Engagement 5 of 5')).toBeInTheDocument();
  });

  it('clamps negative score to 0', () => {
    render(<AudienceEngagementBars score={-10} />);
    expect(screen.getByLabelText('Engagement 0 of 5')).toBeInTheDocument();
  });

  it('uses 20-point step thresholds', () => {
    render(<AudienceEngagementBars score={40} />);
    expect(screen.getByLabelText('Engagement 2 of 5')).toBeInTheDocument();
  });
});
