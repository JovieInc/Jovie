import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeFanRelationshipSection } from './HomeFanRelationshipSection';

vi.mock('./MarketingRenderSurface', () => ({
  MarketingRenderSurface: ({
    surfaceId,
  }: Readonly<{
    surfaceId: string;
  }>) => (
    <div data-surface-id={surfaceId} data-testid='marketing-render-surface' />
  ),
}));

describe('HomeFanRelationshipSection', () => {
  it('renders bounded relationship copy and paired render surfaces', () => {
    render(<HomeFanRelationshipSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Turn action into a relationship.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getAllByTestId('marketing-render-surface')).toHaveLength(2);
    expect(screen.getByText('Take the payment.')).toBeInTheDocument();
    expect(screen.getByText('Keep the signal.')).toBeInTheDocument();
  });
});
