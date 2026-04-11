import { render, screen } from '@testing-library/react';
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
    expect(className).toContain('rounded-[10px]');
  });

  it('drawer and sidebar cards use border-only elevation (no shadow)', () => {
    expect(LINEAR_SURFACE.drawerCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.drawerCard).toContain('border-subtle');
    expect(LINEAR_SURFACE.drawerCard).toContain('bg-surface-1');
    expect(LINEAR_SURFACE.drawerCardSm).toContain('shadow-none');
    expect(LINEAR_SURFACE.sidebarCard).toContain('shadow-none');

    expect(LINEAR_SURFACE.contentContainer).toContain('shadow-none');
    expect(LINEAR_SURFACE.popover).toContain('shadow-[var(--shadow-popover)]');
  });

  it('drawer cards are one tier above content containers', () => {
    expect(LINEAR_SURFACE_TIER.drawerCard).toBe(2);
    expect(LINEAR_SURFACE_TIER.drawerCardSm).toBe(2);
    expect(LINEAR_SURFACE_TIER.sidebarCard).toBe(2);
    expect(LINEAR_SURFACE_TIER.contentContainer).toBe(1);
    expect(LINEAR_SURFACE_TIER.popover).toBe(3);
  });
});
