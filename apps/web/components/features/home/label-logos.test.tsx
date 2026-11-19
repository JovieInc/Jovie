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
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BlancoYNegroLogo, DiscoWaxLogo, RecPlayLogo } from './label-logos';

describe('label-logos', () => {
  it('renders every vector logo with an accessible label', async () => {
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });

  it('draws the text lockups in the on-media token, not raw white', () => {
    render(
      <>
        <DiscoWaxLogo />
        <BlancoYNegroLogo />
        <RecPlayLogo className='text-lg' />
      </>
    );

    for (const label of ['disco:wax', 'Blanco y Negro', 'rec play']) {
      const lockup = screen.getByLabelText(label);
      expect(lockup).toHaveClass('text-on-media/92');
      expect(lockup.className).not.toMatch(/text-white/);
    }
    expect(screen.getByLabelText('rec play')).toHaveClass('text-lg');
  });

  it('keeps the lockups axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DiscoWaxLogo />
        <BlancoYNegroLogo />
        <RecPlayLogo />
      </div>
    );

    expect(screen.getByLabelText('Blanco y Negro')).toBeInTheDocument();
    await expectNoA11yViolations(container);
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
