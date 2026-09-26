import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InsightCategory } from '@/types/insights';
import { InsightCategoryIcon } from './InsightCategoryIcon';

/**
 * JOV-3486: category icons must use carbon accent tokens
 * (`var(--color-accent-*)`) rather than raw Tailwind colors. The neutral
 * `timing` category stays on greyscale tokens.
 */
const ACCENT_BY_CATEGORY: Record<InsightCategory, string | null> = {
  geographic: 'var(--color-accent-blue)',
  growth: 'var(--color-accent-green)',
  content: 'var(--color-accent-purple)',
  revenue: 'var(--color-accent-teal)',
  tour: 'var(--color-accent-orange)',
  platform: 'var(--color-accent-gray)',
  engagement: 'var(--color-accent-pink)',
  timing: null,
};

const RAW_COLOR =
  /(?:text|bg|border)-(?:blue|emerald|yellow|amber|sky|orange|purple|pink|red|green)-\d/;

describe('InsightCategoryIcon carbon tokens', () => {
  it.each(
    Object.entries(ACCENT_BY_CATEGORY)
  )('applies a carbon accent token for %s', (category, expectedSolid) => {
    const { container } = render(
      <InsightCategoryIcon category={category as InsightCategory} />
    );
    const chip = container.firstElementChild as HTMLElement;
    const icon = chip.querySelector('svg') as SVGElement;

    // No raw Tailwind color classes survive on the chip or icon.
    expect(chip.className).not.toMatch(RAW_COLOR);
    expect(icon.getAttribute('class') ?? '').not.toMatch(RAW_COLOR);

    if (expectedSolid) {
      expect(chip.style.backgroundColor).toContain('--color-accent-');
      expect(icon.getAttribute('style') ?? '').toContain(expectedSolid);
    } else {
      // Neutral timing category uses greyscale tokens, no inline accent var.
      expect(chip.className).toContain('bg-surface-0');
      expect(icon.getAttribute('class') ?? '').toContain('text-tertiary-token');
    }
  });
});
