import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Play } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IconBtn } from './IconBtn';

describe('IconBtn certificate', () => {
  it.each([
    ['default', false],
    ['default', true],
    ['ghost', false],
    ['ghost', true],
  ] as const)(
    'keeps the %s tone (active %s) pressable by mouse and keyboard, axe-clean',
    async (tone, active) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      const { container } = render(
        <IconBtn
          label='Play'
          tone={tone}
          active={active}
          onClick={onClick}
          testId='btn'
        >
          <Play aria-hidden='true' />
        </IconBtn>
      );

      const button = screen.getByTestId('btn');
      await user.click(button);
      button.focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledTimes(2);
      expect(button.className.includes('bg-surface-1/')).toBe(true);
      await expectNoA11yViolations(container);
    }
  );

  it('keeps a long label and custom class in a right-to-left toolbar', async () => {
    const label = 'Play the full track from the beginning in the global player';
    const { container } = render(
      <div dir='rtl'>
        <IconBtn label={label} className='custom'>
          <Play aria-hidden='true' />
        </IconBtn>
      </div>
    );

    expect(screen.getByRole('button', { name: label })).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });
});
