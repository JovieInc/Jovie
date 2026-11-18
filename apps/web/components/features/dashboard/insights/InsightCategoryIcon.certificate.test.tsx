import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { InsightCategory } from '@/types/insights';
import { InsightCategoryIcon } from './InsightCategoryIcon';

const CATEGORIES: InsightCategory[] = [
  'geographic',
  'growth',
  'content',
  'revenue',
  'tour',
  'platform',
  'engagement',
  'timing',
];

describe('InsightCategoryIcon certificate', () => {
  it.each(CATEGORIES)(
    'draws a decorative glyph for %s with no accessible text',
    async category => {
      const { container } = render(<InsightCategoryIcon category={category} />);

      const icon = container.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(container).toHaveTextContent('');
      await expectNoA11yViolations(container);
    }
  );

  it('shrinks the chip and glyph at the small size', async () => {
    const { container } = render(
      <InsightCategoryIcon category='tour' size='sm' />
    );

    expect(container.firstElementChild).toHaveClass('h-6', 'w-6');
    expect(container.querySelector('svg')).toHaveClass('h-3.5', 'w-3.5');
    await expectNoA11yViolations(container);
  });

  it('stays accessible beside right-to-left copy', async () => {
    const { container } = render(
      <div dir='rtl'>
        <InsightCategoryIcon category='growth' />
        <span>تسارع نمو الجمهور</span>
      </div>
    );

    expect(screen.getByText('تسارع نمو الجمهور')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
