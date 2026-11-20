import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseArtworkThumb } from './ReleaseArtworkThumb';

describe('ReleaseArtworkThumb', () => {
  it('renders the real artwork image when a src is provided', async () => {
    const { container } = render(
      <ReleaseArtworkThumb
        src='https://example.com/art.jpg'
        alt='Midnight Drive'
      />
    );

    expect(screen.getByAltText('Midnight Drive')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the banned-icon-safe AudioLines glyph without a src', async () => {
    const { container } = render(
      <ReleaseArtworkThumb src={null} alt='Midnight Drive' />
    );

    const icon = container.querySelector('[data-artwork-fallback-icon]');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
    await expectNoA11yViolations(container);
  });
});
