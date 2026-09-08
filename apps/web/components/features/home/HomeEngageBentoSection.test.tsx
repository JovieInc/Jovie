import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeEngageBentoSection } from './HomeEngageBentoSection';

vi.mock('./MarketingRenderSurface', () => ({
  MarketingRenderSurface: ({
    surfaceId,
  }: Readonly<{
    surfaceId: string;
  }>) => (
    <div data-surface-id={surfaceId} data-testid='marketing-render-surface' />
  ),
}));

describe('HomeEngageBentoSection', () => {
  it('renders bounded engage heading and every bento card receipt', () => {
    render(<HomeEngageBentoSection />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Engage.' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getAllByTestId('marketing-render-surface')).toHaveLength(5);
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Smart links that stay current.',
      })
    ).toBeInTheDocument();
  });
});
