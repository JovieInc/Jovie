import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActivityHoverRow } from './ActivityHoverRow';

describe('ActivityHoverRow certificate', () => {
  it('opens the activity by click and keyboard, axe-clean', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ActivityHoverRow
        icon={Sparkles}
        label='Canvas regenerated'
        meta='2m ago'
        running
        iconAccent
        onClick={onClick}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Canvas regenerated/ })
    );
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2m ago')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the danger tone, empty meta and a right-to-left label axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ActivityHoverRow
          icon={Sparkles}
          label='تم حذف الغلاف'
          meta=''
          danger
          className='custom'
        />
      </div>
    );

    expect(screen.getByRole('button')).toHaveClass(
      'custom',
      'text-error-text/85'
    );
    await expectNoA11yViolations(container);
  });
});
