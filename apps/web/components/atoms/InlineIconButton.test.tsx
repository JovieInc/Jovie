import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  INLINE_ICON_BUTTON_FADE_CLASSNAME,
  INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
  InlineIconButton,
} from './InlineIconButton';

const Glyph = () => <svg aria-hidden='true' data-testid='glyph' />;

describe('InlineIconButton', () => {
  it('activates a named button by pointer and keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <InlineIconButton aria-label='Copy link' onClick={onClick}>
        <Glyph />
      </InlineIconButton>
    );

    const button = screen.getByRole('button', { name: 'Copy link' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass(INLINE_ICON_BUTTON_VISIBLE_CLASSNAME);
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('ignores activation while disabled and stays out of the tab order', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <InlineIconButton aria-label='Edit title' onClick={onClick} disabled>
        <Glyph />
      </InlineIconButton>
    );

    const button = screen.getByRole('button', { name: 'Edit title' });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.tab();
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('fades with its parent row but still reveals on keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className='group'>
        <InlineIconButton aria-label='Open release' fadeOnParentHover>
          <Glyph />
        </InlineIconButton>
      </div>
    );

    const button = screen.getByRole('button', { name: 'Open release' });
    expect(button).toHaveClass(INLINE_ICON_BUTTON_FADE_CLASSNAME);
    await user.tab();
    expect(button).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders a named link that follows the anchor contract', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const { container } = render(
      <InlineIconButton
        href='https://jov.ie/tim'
        aria-label='Open profile'
        target='_blank'
        rel='noopener noreferrer'
        onClick={onClick}
      >
        <Glyph />
      </InlineIconButton>
    );

    const link = screen.getByRole('link', { name: 'Open profile' });
    expect(link).toHaveAttribute('href', 'https://jov.ie/tim');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).not.toHaveAttribute('type');
    await user.click(link);
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
