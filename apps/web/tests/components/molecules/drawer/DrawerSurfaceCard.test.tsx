import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import {
  LINEAR_SURFACE,
  LINEAR_SURFACE_TIER,
} from '@/features/dashboard/tokens';

describe('DrawerSurfaceCard', () => {
  it('defaults to the flat variant', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' className='custom-class'>
        Flat
      </DrawerSurfaceCard>
    );

    const card = screen.getByTestId('surface-card');
    const className = card.getAttribute('class') ?? '';

    expect(className).toContain('custom-class');
    expect(className).toContain('border-0');
    expect(className).toContain('bg-transparent');
    expect(className).toContain('shadow-none');
    expect(className).not.toContain('shadow-card');
    expect(card).toHaveAttribute('data-variant', 'flat');
    expect(card).toHaveAttribute('data-surface-variant', 'flat');
  });

  it('applies Tier 2 card chrome when variant is card', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='card'>
        Card
      </DrawerSurfaceCard>
    );

    const className =
      screen.getByTestId('surface-card').getAttribute('class') ?? '';

    expect(className).toContain('border-subtle');
    expect(className).toContain('bg-surface-1');
    expect(className).toContain('shadow-none');
    expect(className).toContain('rounded-lg');
    expect(className).not.toContain('shadow-card');
    expect(screen.getByTestId('surface-card')).toHaveAttribute(
      'data-surface-variant',
      'card'
    );
  });

  it('drawer and sidebar cards use border-only elevation (no shadow)', () => {
    expect(LINEAR_SURFACE.drawerCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.drawerCard).toContain('border-subtle');
    expect(LINEAR_SURFACE.drawerCard).toContain('bg-surface-1');
    expect(LINEAR_SURFACE.drawerCardSm).toContain('shadow-none');
    expect(LINEAR_SURFACE.sidebarCard).toContain('shadow-none');

    expect(LINEAR_SURFACE.contentContainer).toContain('shadow-none');
    expect(LINEAR_SURFACE.popover).toContain('shadow-(--shadow-popover)');
  });

  it('drawer cards are one tier above content containers', () => {
    expect(LINEAR_SURFACE_TIER.drawerCard).toBe(2);
    expect(LINEAR_SURFACE_TIER.drawerCardSm).toBe(2);
    expect(LINEAR_SURFACE_TIER.sidebarCard).toBe(2);
    expect(LINEAR_SURFACE_TIER.contentContainer).toBe(1);
    expect(LINEAR_SURFACE_TIER.popover).toBe(3);
  });

  it('forwards refs and drawer state attributes to the semantic root', () => {
    const ref = createRef<HTMLElement>();

    render(
      <DrawerSurfaceCard
        ref={ref}
        as='section'
        testId='surface-card'
        id='details'
        aria-busy
        data-right-rail-section='identity'
      >
        Details
      </DrawerSurfaceCard>
    );

    const card = screen.getByTestId('surface-card');
    expect(ref.current).toBe(card);
    expect(card.tagName).toBe('SECTION');
    expect(card).toHaveAttribute('id', 'details');
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(card).toHaveAttribute('data-right-rail-section', 'identity');
  });

  it('preserves native interactive semantics', async () => {
    const user = userEvent.setup();
    let presses = 0;

    render(
      <DrawerSurfaceCard
        as='button'
        aria-label='Open drawer section'
        onClick={() => {
          presses += 1;
        }}
      >
        Open
      </DrawerSurfaceCard>
    );

    await user.click(
      screen.getByRole('button', { name: 'Open drawer section' })
    );
    expect(presses).toBe(1);
  });

  it('composes flat content inside a card surface without wrapper drift', () => {
    render(
      <DrawerSurfaceCard variant='card' testId='outer-card'>
        <DrawerSurfaceCard testId='inner-flat'>Inner content</DrawerSurfaceCard>
      </DrawerSurfaceCard>
    );

    const outer = screen.getByTestId('outer-card');
    const inner = screen.getByTestId('inner-flat');
    expect(inner.parentElement).toBe(outer);
    expect(outer.className).toContain('rounded-lg');
    expect(inner.className).not.toContain('rounded-lg');
    expect(inner.className).toContain('bg-transparent');
  });
});
