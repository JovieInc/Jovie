import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoPriorityIcon } from './DemoPriorityIcon';

const CASES = [
  { priority: 'urgent', label: 'Urgent', bars: 4 },
  { priority: 'high', label: 'High', bars: 3 },
  { priority: 'medium', label: 'Medium', bars: 2 },
  { priority: 'low', label: 'Low', bars: 1 },
] as const;

describe('DemoPriorityIcon certificate', () => {
  it.each(CASES)(
    'labels $priority and draws $bars bars',
    async ({ priority, label, bars }) => {
      const { container } = render(<DemoPriorityIcon priority={priority} />);

      const svg = container.querySelector('svg');
      const title = screen.getByTitle(label);
      expect(svg).toHaveAttribute('aria-labelledby', title.id);
      expect(container.querySelectorAll('rect')).toHaveLength(bars);
      expect(container.querySelector('line')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('draws a dash for no priority', async () => {
    const { container } = render(<DemoPriorityIcon priority='none' />);

    expect(screen.getByTitle('No Priority')).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(container.querySelector('line')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('gives each icon its own title id in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DemoPriorityIcon priority='urgent' />
        <DemoPriorityIcon priority='urgent' />
      </div>
    );

    const ids = [...container.querySelectorAll('title')].map(t => t.id);
    expect(new Set(ids).size).toBe(2);
    await expectNoA11yViolations(container);
  });
});
