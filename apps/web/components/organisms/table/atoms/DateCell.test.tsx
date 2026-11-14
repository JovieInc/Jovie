import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DateCell } from './DateCell';

const DATE = new Date('2026-09-01T12:00:00.000Z');

function renderCell(node: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>);
}

describe('DateCell', () => {
  it('shows the short date and the long date in a tooltip on hover', async () => {
    const user = userEvent.setup();
    const { container } = renderCell(<DateCell date={DATE} />);

    const cell = screen.getByText('Sep 1, 2026');
    expect(cell).toHaveClass('cursor-help');
    await expectNoA11yViolations(container);
    await user.hover(cell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'September 1, 2026'
    );
  });

  it('shows a dash and no tooltip without a date', async () => {
    const user = userEvent.setup();
    const { container } = renderCell(
      <DateCell date={null} className='custom' />
    );

    const cell = screen.getByText('—');
    expect(cell).toHaveClass('custom');
    expect(cell).not.toHaveClass('cursor-help');
    await user.hover(cell);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('applies custom formats and locale', async () => {
    const user = userEvent.setup();
    const { container } = renderCell(
      <DateCell
        date={DATE}
        locale='en-GB'
        formatOptions={{ day: 'numeric', month: 'long', timeZone: 'UTC' }}
        tooltipFormatOptions={{ year: 'numeric', timeZone: 'UTC' }}
      />
    );

    const cell = screen.getByText('1 September');
    await user.hover(cell);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('2026');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic locale in an RTL document', async () => {
    const { container } = renderCell(
      <div dir='rtl'>
        <DateCell date={DATE} locale='ar-EG' />
      </div>
    );

    expect(container.querySelector('span')?.textContent).not.toBe('—');
    await expectNoA11yViolations(container);
  });
});
