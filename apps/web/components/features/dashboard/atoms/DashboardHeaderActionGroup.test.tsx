import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DashboardHeaderActionGroup } from './DashboardHeaderActionGroup';

describe('DashboardHeaderActionGroup certificate', () => {
  it('renders only the empty row when no actions are passed', async () => {
    const { container } = render(
      <DashboardHeaderActionGroup className='custom-row' />
    );

    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveClass('custom-row');
    expect(row.childElementCount).toBe(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders trailing actions alone, pushed to the end', async () => {
    const { container } = render(
      <DashboardHeaderActionGroup
        trailing={<Button size='sm'>Export</Button>}
        trailingClassName='trailing-slot'
      />
    );

    const row = container.firstElementChild as HTMLElement;
    expect(row.childElementCount).toBe(1);
    const trailing = screen.getByRole('button', { name: 'Export' })
      .parentElement as HTMLElement;
    expect(trailing).toHaveClass('ml-auto', 'trailing-slot');
    await expectNoA11yViolations(container);
  });

  it('keeps leading and trailing actions clickable in order', async () => {
    const user = userEvent.setup();
    const onFilter = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      <DashboardHeaderActionGroup
        leadingClassName='leading-slot'
        trailing={
          <Button size='sm' onClick={onExport}>
            Export
          </Button>
        }
      >
        <Button size='sm' onClick={onFilter}>
          Filter
        </Button>
      </DashboardHeaderActionGroup>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Filter', 'Export']);
    expect(buttons[0].parentElement).toHaveClass('leading-slot');
    await user.click(buttons[0]);
    await user.click(buttons[1]);
    expect(onFilter).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('scrolls many actions sideways and stays accessible in RTL', async () => {
    const labels = ['Filter', 'Sort', 'Group', 'Archived', 'Columns'];
    const { container } = render(
      <div dir='rtl'>
        <DashboardHeaderActionGroup>
          {labels.map(label => (
            <Button key={label} size='sm'>
              {label}
            </Button>
          ))}
        </DashboardHeaderActionGroup>
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(labels.length);
    const row = container.querySelector('[dir="rtl"] > div') as HTMLElement;
    expect(row).toHaveClass('overflow-x-auto');
    await expectNoA11yViolations(container);
  });
});
