import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

describe('ContentSurfaceCard', () => {
  it('renders its children', () => {
    render(
      <ContentSurfaceCard data-testid='content-card'>
        Card body
      </ContentSurfaceCard>
    );

    const card = screen.getByTestId('content-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Card body');
  });
});
