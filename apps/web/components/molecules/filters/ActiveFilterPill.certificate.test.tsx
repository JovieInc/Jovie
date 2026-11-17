import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActiveFilterPill } from './ActiveFilterPill';

describe('ActiveFilterPill certificate', () => {
  it('shows a single value and clears from pointer and keyboard, axe-clean', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { container } = render(
      <ActiveFilterPill
        groupLabel='Status'
        values={['Todo']}
        icon={<svg aria-hidden='true' data-testid='status-icon' />}
        onClear={onClear}
      />
    );

    expect(screen.getByText('Todo')).toBeVisible();
    expect(screen.getByTestId('status-icon')).toBeInTheDocument();
    const clear = screen.getByRole('button', { name: 'Clear Status filter' });
    await user.click(clear);
    clear.focus();
    await user.keyboard('{Enter}');
    expect(onClear).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('renders nothing when no values are selected (empty)', async () => {
    const { container } = render(
      <ActiveFilterPill groupLabel='Status' values={[]} onClear={vi.fn()} />
    );

    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL filters axe-clean', async () => {
    const value = 'Worldwide except territories under an exclusive licence';
    const { container } = render(
      <div dir='rtl'>
        <ActiveFilterPill
          groupLabel='Distribution territory'
          values={[value]}
          onClear={vi.fn()}
        />
        <ActiveFilterPill
          groupLabel='الحالة'
          values={['قيد التنفيذ', 'مكتمل']}
          onClear={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText('2 selected')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Clear الحالة filter' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
