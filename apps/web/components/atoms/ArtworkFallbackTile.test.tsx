import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtworkFallbackTile } from './ArtworkFallbackTile';

describe('ArtworkFallbackTile', () => {
  it('renders the deterministic fallback surface for a seed', async () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    const tile = container.querySelector('[data-artwork-fallback="true"]');
    expect(tile).toBeTruthy();
    // on-media is the fixed #ffffff in light and dark.
    expect(tile).toHaveClass('text-on-media/40');
    await expectNoA11yViolations(container);
  });

  it('draws the sleeve bevel from the artwork fallback tokens', () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    const sleeve = container.querySelector('[data-artwork-fallback-sleeve]');
    expect(sleeve).toHaveClass(
      'bg-(image:--artwork-fallback-sleeve)',
      'shadow-(--artwork-fallback-sleeve-shadow)',
      'rounded-[7%]'
    );
  });

  it('rounds the hero sleeve a step more', async () => {
    const { container } = render(
      <ArtworkFallbackTile seed='rel_1' size='hero' />
    );

    expect(
      container.querySelector('[data-artwork-fallback-sleeve]')
    ).toHaveClass('rounded-[10%]');
    await expectNoA11yViolations(container);
  });

  it('uses the banned-icon-safe AudioLines glyph, not the retired Disc3', () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    const icon = container.querySelector('[data-artwork-fallback-icon]');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('drops the decorative sleeve and accent bar for thumbnail size', async () => {
    const { container } = render(
      <ArtworkFallbackTile seed='rel_1' size='thumbnail' />
    );

    expect(
      container.querySelector('[data-artwork-fallback-sleeve]')
    ).toBeNull();
    expect(
      container.querySelector('[data-artwork-fallback-compact="true"]')
    ).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('stays decorative with no label', () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    expect(container.querySelector('.sr-only')).toBeNull();
  });

  it('gives a long title to assistive tech only', async () => {
    const label =
      'Never Say A Word (Extended Club Mix) feat. The Los Angeles After Hours Orchestra';
    const { container } = render(
      <ArtworkFallbackTile seed='rel_1' label={label} />
    );

    expect(screen.getByText(label)).toHaveClass('sr-only');
    await expectNoA11yViolations(container);
  });

  it('keeps the same face in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtworkFallbackTile seed='rel_1' label='منتصف الليل' />
      </div>
    );

    expect(screen.getByText('منتصف الليل')).toHaveClass('sr-only');
    expect(
      container.querySelector('[data-artwork-fallback-sleeve]')
    ).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
