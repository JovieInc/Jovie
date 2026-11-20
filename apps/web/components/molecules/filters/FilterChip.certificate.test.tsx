import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FilterChip } from './FilterChip';

describe('FilterChip certificate', () => {
  it('toggles from the keyboard and stays axe-clean pressed and unpressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container, rerender } = render(
      <FilterChip pressed={false} onClick={onClick}>
        Overdue
      </FilterChip>
    );
    await expectNoA11yViolations(container);

    await user.tab();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <FilterChip pressed onClick={onClick}>
        Overdue
      </FilterChip>
    );
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a long RTL label without violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <FilterChip pressed={false} onClick={vi.fn()}>
          في انتظار موافقة الشركة على العمل الفني
        </FilterChip>
      </div>
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
