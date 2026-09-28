import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    alt = '',
    unoptimized: _unoptimized,
    ...props
  }: ComponentProps<'img'> & { readonly unoptimized?: boolean }) => (
    <img alt={alt} {...props} />
  ),
}));

import { NormalizedTrustLogo } from '@/components/media/NormalizedTrustLogo';
import { BlancoYNegroLogo, DiscoWaxLogo, RecPlayLogo } from './label-logos';

describe('label-logos', () => {
  it('renders every vector logo with an accessible label', () => {
    render(
      <>
        <NormalizedTrustLogo id='umg' />
        <NormalizedTrustLogo id='armada' />
        <NormalizedTrustLogo id='awal' />
        <NormalizedTrustLogo id='orchard' />
        <DiscoWaxLogo />
        <BlancoYNegroLogo />
        <RecPlayLogo />
      </>
    );

    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.getByLabelText('Armada Music')).toBeInTheDocument();
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
    expect(screen.getByLabelText('The Orchard')).toBeInTheDocument();
    expect(screen.getByLabelText('disco:wax')).toBeInTheDocument();
    expect(screen.getByLabelText('Blanco y Negro')).toBeInTheDocument();
    expect(screen.getByLabelText('rec play')).toBeInTheDocument();
  });

  it('serves the Black Hole logo as a direct public asset (JOV-6849)', () => {
    render(<NormalizedTrustLogo id='black-hole-recordings' />);

    const img = screen.getByAltText('Black Hole Recordings');
    expect(img).toHaveAttribute(
      'src',
      '/brand-logos/black-hole-recordings.png'
    );
    expect(img.getAttribute('src')).not.toContain('/_next/image');
  });
});
