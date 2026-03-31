import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContentSurfaceCard } from './ContentSurfaceCard';

describe('ContentSurfaceCard', () => {
  it('renders children', () => {
    render(<ContentSurfaceCard data-testid='card'>Hello</ContentSurfaceCard>);
    expect(screen.getByTestId('card')).toHaveTextContent('Hello');
  });

  it('applies default surface variant', () => {
    render(<ContentSurfaceCard data-testid='card'>Content</ContentSurfaceCard>);
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('shadow-none');
  });

  it('applies marketing surface variant', () => {
    render(
      <ContentSurfaceCard surface='marketing' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-xl');
  });

  it('applies settings surface variant', () => {
    render(
      <ContentSurfaceCard surface='settings' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('shadow-none');
  });

  it('uses the nested surface variant for tighter inner surfaces', () => {
    render(
      <ContentSurfaceCard surface='nested' data-testid='nested-card'>
        Nested body
      </ContentSurfaceCard>
    );
    const card = screen.getByTestId('nested-card');
    expect(card.className).toContain('rounded-[10px]');
    expect(card.className).toContain('shadow-none');
  });

  it('renders as custom element', () => {
    render(
      <ContentSurfaceCard as='section' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    expect(screen.getByTestId('card').tagName).toBe('SECTION');
  });

  it('merges custom className', () => {
    render(
      <ContentSurfaceCard className='mt-4' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    expect(screen.getByTestId('card').className).toContain('mt-4');
  });
});
