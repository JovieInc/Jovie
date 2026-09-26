import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SURFACE_CARD_CLASSNAME,
  ContentSurfaceCard,
  contentSurfaceCardVariants,
} from '@/components/molecules/ContentSurfaceCard';

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
    expect(card.className).toContain('bg-surface-1');
    expect(card.className).toContain('shadow-none');
    expect(card.className).not.toContain('shadow-card');
    expect(card).not.toHaveAttribute('data-variant');
  });

  it('uses the nested variant for tighter inner surfaces', () => {
    render(
      <ContentSurfaceCard data-testid='nested-card' surface='nested'>
        Nested body
      </ContentSurfaceCard>
    );

    const card = screen.getByTestId('nested-card');
    expect(card.className).toContain('rounded-lg');
    expect(card.className).toContain('bg-surface-0');
    expect(card.className).not.toContain('bg-surface-1');
    expect(card.className).toContain('shadow-none');
  });

  it.each([
    'default',
    'details',
    'marketing',
    'settings',
    'table',
  ] as const)('keeps the %s surface on the established outer-card radius', surface => {
    expect(contentSurfaceCardVariants({ surface })).toContain('rounded-xl');
  });

  it('keeps the deprecated class contract visually equivalent', () => {
    expect(CONTENT_SURFACE_CARD_CLASSNAME).toContain('rounded-xl');
    expect(CONTENT_SURFACE_CARD_CLASSNAME).toContain(
      'border-(--app-shell-border)'
    );
    expect(CONTENT_SURFACE_CARD_CLASSNAME).toContain('bg-surface-1');
    expect(CONTENT_SURFACE_CARD_CLASSNAME).toContain('shadow-none');
  });

  it('forwards a root ref while retaining arbitrary HTML attributes', () => {
    const ref = createRef<HTMLElement>();
    render(
      <ContentSurfaceCard
        ref={ref}
        data-testid='ref-card'
        aria-live='polite'
        inert
      >
        Status
      </ContentSurfaceCard>
    );

    expect(ref.current).toBe(screen.getByTestId('ref-card'));
    expect(ref.current).toHaveAttribute('aria-live', 'polite');
    expect(ref.current).toHaveAttribute('inert');
  });
});
