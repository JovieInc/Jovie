import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

describe('ThreadCardIconBtn', () => {
  it('names the button by its label and fires onClick by mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ThreadCardIconBtn label='Download' onClick={onClick}>
        <svg aria-hidden='true' />
      </ThreadCardIconBtn>
    );

    const button = screen.getByRole('button', { name: 'Download' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('renders without a handler and with a long label in a right-to-left toolbar', async () => {
    const label =
      'Download the original lossless master of this thread attachment';
    const { container } = render(
      <div dir='rtl'>
        <ThreadCardIconBtn label={label}>
          <svg aria-hidden='true' />
        </ThreadCardIconBtn>
      </div>
    );

    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
