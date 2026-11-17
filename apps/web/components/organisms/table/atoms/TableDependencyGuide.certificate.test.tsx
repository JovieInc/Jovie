import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableDependencyGuide } from './TableDependencyGuide';

describe('TableDependencyGuide certificate', () => {
  it.each([false, true])(
    'stays decorative and axe-clean with last=%s',
    async last => {
      const { container } = render(
        <div className='flex'>
          <TableDependencyGuide last={last} className='custom-guide' />
          <span>Child asset</span>
        </div>
      );

      const guide = screen.getByTestId('table-dependency-guide');
      expect(guide).toHaveAttribute('aria-hidden', 'true');
      expect(guide).toHaveAttribute('data-last', String(last));
      expect(guide).toHaveClass('custom-guide');
      await expectNoA11yViolations(container);
    }
  );
});
