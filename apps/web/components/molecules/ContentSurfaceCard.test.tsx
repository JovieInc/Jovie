import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
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
    expect(card.className).toContain('border-(--app-shell-border)');
    expect(card.className).toContain('bg-surface-1');
    expect(card.className).toContain('shadow-none');
    expect(card.className).not.toContain('shadow-card');
    expect(card).not.toHaveAttribute('data-variant');
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
  });

  it('renders as custom element', () => {
    render(
      <ContentSurfaceCard as='section' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    expect(screen.getByTestId('card').tagName).toBe('SECTION');
    expect(screen.getByTestId('card').parentElement?.parentElement).toBe(
      document.body
    );
  });

  it('merges custom className', () => {
    render(
      <ContentSurfaceCard className='mt-4' data-testid='card'>
        Content
      </ContentSurfaceCard>
    );
    expect(screen.getByTestId('card').className).toContain('mt-4');
  });

  it('forwards refs to the semantic root without adding a wrapper', () => {
    const ref = createRef<HTMLElement>();

    render(
      <ContentSurfaceCard ref={ref} as='article' data-testid='card'>
        Article content
      </ContentSurfaceCard>
    );

    expect(ref.current).toBe(screen.getByTestId('card'));
    expect(ref.current?.tagName).toBe('ARTICLE');
  });

  it('preserves native interactive semantics and event handlers', async () => {
    const user = userEvent.setup();
    let presses = 0;

    render(
      <ContentSurfaceCard
        as='button'
        aria-label='Open summary'
        onClick={() => {
          presses += 1;
        }}
      >
        Open
      </ContentSurfaceCard>
    );

    const button = screen.getByRole('button', { name: 'Open summary' });
    expect(button.tagName).toBe('BUTTON');
    await user.click(button);
    expect(presses).toBe(1);
  });

  it('supports nested surfaces without duplicating DOM wrappers', () => {
    render(
      <ContentSurfaceCard data-testid='outer-card'>
        <ContentSurfaceCard surface='nested' data-testid='inner-card'>
          Nested content
        </ContentSurfaceCard>
      </ContentSurfaceCard>
    );

    const outer = screen.getByTestId('outer-card');
    const inner = screen.getByTestId('inner-card');
    expect(inner.parentElement).toBe(outer);
    expect(outer.className).toContain('rounded-xl');
    expect(outer.className).toContain('bg-surface-1');
    expect(inner.className).toContain('rounded-lg');
    expect(inner.className).toContain('bg-surface-0');
    expect(inner.className).not.toContain('bg-surface-1');
  });
});
