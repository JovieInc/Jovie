import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  DRAWER_INLINE_ICON_BUTTON_FADE_CLASSNAME,
  DrawerInlineIconButton,
} from './DrawerInlineIconButton';

describe('DrawerInlineIconButton', () => {
  it('forwards clicks and keyboard activation to the drawer handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DrawerInlineIconButton aria-label='Copy link' onClick={onClick}>
        <Copy className='h-3.5 w-3.5' />
      </DrawerInlineIconButton>
    );

    const button = screen.getByRole('button', { name: 'Copy link' });
    await expectNoA11yViolations(container);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.keyboard('{Enter}');
    expect(button).toHaveFocus();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps the drawer row hover reveal reachable by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className='group'>
        <span>jov.ie/tim</span>
        <DrawerInlineIconButton aria-label='Copy link' fadeOnParentHover>
          <Copy className='h-3.5 w-3.5' />
        </DrawerInlineIconButton>
      </div>
    );

    const button = screen.getByRole('button', { name: 'Copy link' });
    expect(button).toHaveClass(DRAWER_INLINE_ICON_BUTTON_FADE_CLASSNAME);
    await user.tab();
    expect(button).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders an external drawer link with its name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const { container } = render(
      <DrawerInlineIconButton
        href='https://jov.ie/tim'
        aria-label='Open profile'
        onClick={onClick}
      >
        <Copy className='h-3.5 w-3.5' />
      </DrawerInlineIconButton>
    );

    const link = screen.getByRole('link', { name: 'Open profile' });
    expect(link).toHaveAttribute('href', 'https://jov.ie/tim');
    await user.click(link);
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('does not fire while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DrawerInlineIconButton aria-label='Copy link' onClick={onClick} disabled>
        <Copy className='h-3.5 w-3.5' />
      </DrawerInlineIconButton>
    );

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
