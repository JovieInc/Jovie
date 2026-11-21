import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PriorityGlyph, type PriorityLevel } from './PriorityGlyph';

describe('PriorityGlyph certificate', () => {
  it.each(['none', 'low', 'medium', 'high', 'urgent'] as PriorityLevel[])(
    'keeps the %s level axe-clean',
    async priority => {
      const { container } = render(
        <PriorityGlyph priority={priority} className='custom' />
      );

      expect(container.querySelector('.custom')).not.toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('fills the bars up to the level in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <PriorityGlyph priority='high' />
      </div>
    );

    expect(container.querySelectorAll('.bg-secondary-token')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });
});
