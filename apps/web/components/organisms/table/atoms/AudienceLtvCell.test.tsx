import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceLtvCell, formatDollars } from './AudienceLtvCell';

const base = {
  tipAmountTotalCents: 0,
  tipCount: 0,
  visits: 0,
  engagementScore: 0,
};

function renderCell(props: Parameters<typeof AudienceLtvCell>[0], dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AudienceLtvCell {...props} />
      </div>
    </TooltipProvider>
  );
}

describe('AudienceLtvCell', () => {
  it('formats cents as dollars without trailing zeros', () => {
    expect(formatDollars(4500)).toBe('$45');
    expect(formatDollars(4550)).toBe('$45.5');
  });

  it('shows a dash and no tooltip when there is no value', async () => {
    const user = userEvent.setup();
    const { container } = renderCell(base);

    await user.hover(screen.getByText('---'));
    expect(screen.queryByText('Lifetime Value')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the total and a breakdown tooltip for a valued member', async () => {
    const user = userEvent.setup();
    const { container } = renderCell({
      ...base,
      tipAmountTotalCents: 12000,
      tipCount: 4,
      visits: 8,
      engagementScore: 70,
      merchSalesCents: 2500,
    });

    const label = screen.getByText(/^\$/);
    expect(label).toHaveClass('tabular-nums');
    await user.hover(label);
    expect(
      (await screen.findAllByText('Lifetime Value')).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Merch sales').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('keeps a very large value and custom class in a right-to-left row', async () => {
    const { container } = renderCell(
      {
        ...base,
        tipAmountTotalCents: 123456789,
        tipCount: 99,
        className: 'custom',
      },
      'rtl'
    );

    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
