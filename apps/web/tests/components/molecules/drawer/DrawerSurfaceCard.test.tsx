import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';

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

    expect(className).toContain('rounded-[9px]');
    expect(className).toContain('border-(--linear-app-frame-seam)');
    expect(className).toContain('bg-[color-mix');
  });
});
