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
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('shadow-none');
  });

  it('uses the nested variant for tighter inner surfaces', () => {
    render(
      <ContentSurfaceCard data-testid='nested-card' surface='nested'>
        Nested body
      </ContentSurfaceCard>
    );

    const card = screen.getByTestId('nested-card');
    expect(card.className).toContain('rounded-[10px]');
    expect(card.className).toContain('shadow-none');
  });
});
