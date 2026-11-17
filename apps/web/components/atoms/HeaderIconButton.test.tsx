import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HeaderIconButton } from './HeaderIconButton';

const Glyph = () => (
  <svg aria-hidden='true' viewBox='0 0 16 16'>
    <path d='M5 3l5 5-5 5' />
  </svg>
);

describe('HeaderIconButton', () => {
  it('names the icon action, forwards its ref and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <HeaderIconButton ref={ref} ariaLabel='Open menu' onClick={onClick}>
        <Glyph />
      </HeaderIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(ref.current).toBe(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('ignores clicks while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <HeaderIconButton ariaLabel='Open menu' onClick={onClick} disabled>
        <Glyph />
      </HeaderIconButton>
    );

    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a long and an Arabic accessible name', async () => {
    const longName =
      'Open the release plan sidebar with every task, pitch and asset for this drop';
    const { container, unmount } = render(
      <HeaderIconButton ariaLabel={longName} size='xs'>
        <Glyph />
      </HeaderIconButton>
    );
    expect(screen.getByRole('button', { name: longName })).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <HeaderIconButton ariaLabel='فتح القائمة'>
          <Glyph />
        </HeaderIconButton>
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'فتح القائمة' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
