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

  it('applies the card styling when variant is card', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='card'>
        Card
      </DrawerSurfaceCard>
    );

    const className =
      screen.getByTestId('surface-card').getAttribute('class') ?? '';

    expect(className).toContain('rounded-xl');
    expect(className).toContain('border-(--linear-app-shell-border)');
    expect(className).toContain('bg-surface-1');
    expect(className).toContain('shadow-[');
  });

  it('uses the quieter drawer treatment without adding floating shadows', () => {
    render(
      <DrawerSurfaceCard testId='surface-card' variant='quiet'>
        Quiet
      </DrawerSurfaceCard>
    );

    const className =
      screen.getByTestId('surface-card').getAttribute('class') ?? '';

    expect(className).toContain('rounded-xl');
    expect(className).toContain(
      'border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)]'
    );
    expect(className).toContain(
      'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-app-shell-border)_2%)]'
    );
    expect(className).toContain('shadow-none');
  });

  it('keeps elevated shadows scoped to floating sidebar and drawer surfaces', () => {
    expect(LINEAR_SURFACE.drawerCard).toContain('shadow-[');
    expect(LINEAR_SURFACE.drawerCardSm).toContain('shadow-[');
    expect(LINEAR_SURFACE.sidebarCard).toContain('shadow-[');

    expect(LINEAR_SURFACE.contentContainer).toContain('shadow-none');
    expect(LINEAR_SURFACE.bannerCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.dialogCard).toContain('shadow-none');
    expect(LINEAR_SURFACE.popover).toContain('shadow-[var(--shadow-popover)]');
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
