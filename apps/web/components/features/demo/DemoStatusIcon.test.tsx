import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoStatusIcon } from './DemoStatusIcon';

const CASES = [
  { status: 'live', label: 'Live', circles: 1, lines: 0, paths: 1 },
  { status: 'syncing', label: 'Syncing', circles: 1, lines: 1, paths: 0 },
  { status: 'scheduled', label: 'Scheduled', circles: 1, lines: 2, paths: 0 },
  { status: 'draft', label: 'Draft', circles: 1, lines: 0, paths: 0 },
  { status: 'archived', label: 'Archived', circles: 1, lines: 1, paths: 0 },
] as const;

describe('DemoStatusIcon certificate', () => {
  it.each(CASES)(
    'labels $status and draws its glyph',
    async ({ status, label, circles, lines, paths }) => {
      const { container } = render(<DemoStatusIcon status={status} />);

      const title = screen.getByTitle(label);
      expect(container.querySelector('svg')).toHaveAttribute(
        'aria-labelledby',
        title.id
      );
      expect(container.querySelectorAll('circle')).toHaveLength(circles);
      expect(container.querySelectorAll('line')).toHaveLength(lines);
      expect(container.querySelectorAll('path')).toHaveLength(paths);
      await expectNoA11yViolations(container);
    }
  );

  it('dashes the draft ring and stays axe-clean in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DemoStatusIcon status='draft' />
        <DemoStatusIcon status='live' />
      </div>
    );

    expect(container.querySelector('circle')).toHaveAttribute(
      'stroke-dasharray',
      '2 2'
    );
    await expectNoA11yViolations(container);
  });
});
