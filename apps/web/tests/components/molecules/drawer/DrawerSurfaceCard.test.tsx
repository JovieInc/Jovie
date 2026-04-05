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
    expect(className).not.toContain('rounded-xl');
    expect(className).toContain('border-0');
    expect(className).toContain('bg-transparent');
    expect(className).toContain('shadow-none');
  });

  it('applies flat styling when variant is card (no card-in-card nesting)', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='card'>
        Card
      </DrawerSurfaceCard>
    );

    const className =
      screen.getByTestId('surface-card').getAttribute('class') ?? '';

    expect(className).toContain('border-0');
    expect(className).toContain('bg-transparent');
    expect(className).toContain('shadow-none');
  });

  it('uses the quieter drawer treatment without adding floating shadows', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='quiet'>
        Quiet
      </DrawerSurfaceCard>
    );

    expect(screen.getByTestId('surface-card')).toHaveAttribute(
      'data-surface-variant',
      'quiet'
    );
  });

  it('keeps drawer and sidebar cards flat (same tier as content)', () => {
    expect(LINEAR_SURFACE.drawerCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.drawerCardSm).toContain('shadow-none');
    expect(LINEAR_SURFACE.sidebarCard).toContain('shadow-none');

    expect(LINEAR_SURFACE.contentContainer).toContain('shadow-none');
    expect(LINEAR_SURFACE.bannerCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.dialogCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.popover).toContain('shadow-[var(--shadow-popover)]');
  });

  it('drawer and sidebar cards share the same elevation tier as content', () => {
    expect(LINEAR_SURFACE_TIER.drawerCard).toBe(
      LINEAR_SURFACE_TIER.contentContainer
    );
    expect(LINEAR_SURFACE_TIER.drawerCardSm).toBe(
      LINEAR_SURFACE_TIER.contentContainer
    );
    expect(LINEAR_SURFACE_TIER.sidebarCard).toBe(
      LINEAR_SURFACE_TIER.contentContainer
    );
  });
});
