import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LOGO_BAR_VARIANTS } from './logo-bar';

interface MockHomeTrustSectionProps {
  readonly placement?: { readonly page?: string };
  readonly variant?: string;
  readonly presentation?: string;
  readonly label?: ReactNode;
}

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: ({
    placement,
    variant,
    presentation,
    label,
  }: MockHomeTrustSectionProps) => (
    <div
      data-testid='home-trust-section'
      data-page={placement?.page}
      data-variant={variant}
      data-presentation={presentation}
      data-has-label={label !== undefined && label !== null}
    />
  ),
}));

describe('LOGO_BAR_VARIANTS', () => {
  it.each([
    {
      id: 'home-trust-default',
      page: '/artist-profile',
      variant: 'default',
      presentation: 'card',
      wrapperClasses: ['py-12', 'px-6'],
      canonical: true,
    },
    {
      id: 'home-trust-compact',
      page: '/release-notification',
      variant: 'compact',
      presentation: 'card',
      wrapperClasses: ['py-12', 'px-6'],
      canonical: false,
    },
    {
      id: 'home-trust-inline',
      page: '/',
      variant: 'default',
      presentation: 'inline-strip',
      wrapperClasses: ['py-8', 'px-6'],
      canonical: false,
    },
  ])(
    'renders $id with its permission-scoped placement',
    ({
      id,
      page,
      variant: expectedVariant,
      presentation,
      wrapperClasses,
      canonical,
    }) => {
      const definition = LOGO_BAR_VARIANTS.find(item => item.id === id);
      if (!definition) throw new Error(`Missing logo-bar variant: ${id}`);

      render(definition.render());

      const trustSection = screen.getByTestId('home-trust-section');
      expect(trustSection).toHaveAttribute('data-page', page);
      expect(trustSection).toHaveAttribute('data-variant', expectedVariant);
      expect(trustSection).toHaveAttribute('data-presentation', presentation);
      expect(trustSection).toHaveAttribute('data-has-label', 'false');
      expect(trustSection.parentElement).toHaveClass(...wrapperClasses);
      expect(definition).toMatchObject({
        category: 'logo-bar',
        status: 'canonical',
      });
      expect(definition.canonical ?? false).toBe(canonical);
    }
  );
});
