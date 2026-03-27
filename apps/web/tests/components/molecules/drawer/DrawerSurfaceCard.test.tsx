import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { LINEAR_SURFACE_TIER } from '@/features/dashboard/tokens';

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

  it('applies the card styling when variant is card', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='card'>
        Card
      </DrawerSurfaceCard>
    );

    const className =
      screen.getByTestId('surface-card').getAttribute('class') ?? '';

    expect(className).toContain('rounded-[10px]');
    expect(className).toContain('border-(--linear-app-frame-seam)');
    expect(className).toContain('bg-(--linear-app-content-surface)');
    expect(className).toContain(
      'shadow-[0_12px_28px_rgba(15,23,42,0.08),0_2px_6px_rgba(15,23,42,0.05)]'
    );
  });

  it('keeps drawer and sidebar cards on a higher elevation tier than main content containers', () => {
    expect(LINEAR_SURFACE_TIER.drawerCard).toBeGreaterThan(
      LINEAR_SURFACE_TIER.contentContainer
    );
    expect(LINEAR_SURFACE_TIER.drawerCardSm).toBeGreaterThan(
      LINEAR_SURFACE_TIER.contentContainer
    );
    expect(LINEAR_SURFACE_TIER.sidebarCard).toBeGreaterThan(
      LINEAR_SURFACE_TIER.contentContainer
    );
  });
});
