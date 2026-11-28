import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MetaPill } from './MetaPill';

describe('MetaPill certificate', () => {
  it.each(['neutral', 'amber', 'cyan'] as const)(
    'keeps the %s tone axe-clean and inert to the pointer',
    async tone => {
      const user = userEvent.setup();
      const { container } = render(<MetaPill tone={tone}>3 subtasks</MetaPill>);

      const pill = screen.getByText('3 subtasks');
      await user.hover(pill);
      expect(pill).toHaveClass('cursor-default', 'whitespace-nowrap');
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long right-to-left label and custom class axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <MetaPill className='custom'>مهمة فرعية طويلة جدا</MetaPill>
      </div>
    );

    expect(screen.getByText('مهمة فرعية طويلة جدا')).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });
});
