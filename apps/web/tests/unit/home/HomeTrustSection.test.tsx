import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt = '', ...props }: ComponentProps<'img'>) => (
    <img alt={alt} {...props} />
  ),
}));

import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';

describe('HomeTrustSection', () => {
  it('renders the boxed card presentation by default', () => {
    render(<HomeTrustSection />);

    expect(screen.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'card'
    );
    expect(
      screen.getByText('Trusted by artists and teams releasing on')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
  });

  it('renders the homepage inline strip presentation when requested', () => {
    const { container } = render(
      <HomeTrustSection
        presentation='inline-strip'
        label='Trusted by artists'
      />
    );

    expect(screen.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'inline-strip'
    );
    expect(screen.getByText('Trusted by artists')).toBeInTheDocument();
    expect(screen.getByAltText('Black Hole Recordings')).toBeInTheDocument();
    // Text-only logos (BlancoYNegro, RecPlay, DiscoWax) removed — JOV-2075
    expect(screen.queryByLabelText('disco:wax')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Blanco y Negro')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('rec play')).not.toBeInTheDocument();
    expect(container.querySelector('.homepage-trust-logo-grid')).toBeTruthy();
    expect(
      container.querySelectorAll('.homepage-trust-logo-slot')
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-mobile-logo="secondary"]')
    ).toHaveLength(1);
  });

  it('keeps the inline strip on the canonical trust copy', () => {
    render(<HomeTrustSection presentation='inline-strip' />);

    expect(
      screen.getByText('Trusted by artists and teams releasing on')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: 'Trusted by artists and teams releasing on major labels',
      })
    ).toBeInTheDocument();
  });

  it('renders the registered proof moment with named partner attribution', () => {
    const { container } = render(
      <HomeTrustSection presentation='proof-moment' />
    );

    expect(screen.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'proof-moment'
    );
    expect(screen.getByText('Artist proof')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Trusted by artists and teams releasing on',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: 'Trusted by artists and teams releasing on major labels',
      })
    ).toBeInTheDocument();

    for (const partner of [
      'AWAL',
      'The Orchard',
      'Universal Music Group',
      'Armada Music',
    ]) {
      expect(screen.getByLabelText(partner)).toBeInTheDocument();
    }
    expect(screen.getByAltText('Black Hole Recordings')).toBeInTheDocument();
    expect(
      container.querySelector('.homepage-trust-proof-moment__logo-grid')
    ).toBeTruthy();
    expect(
      container.querySelectorAll('.homepage-trust-proof-moment__logo-slot')
    ).toHaveLength(5);
    expect(container.querySelector('.homepage-trust-logo-grid')).toBeNull();
  });
});
