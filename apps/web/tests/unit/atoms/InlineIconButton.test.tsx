import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  INLINE_ICON_BUTTON_FADE_CLASSNAME,
  INLINE_ICON_BUTTON_VISIBLE_CLASSNAME,
  InlineIconButton,
} from '@/components/atoms/InlineIconButton';
import { expectNoA11yViolations } from '../../utils/a11y';

describe('InlineIconButton', () => {
  it('renders a button by default', () => {
    render(
      <InlineIconButton aria-label='Edit item'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    expect(screen.getByRole('button', { name: 'Edit item' })).toHaveAttribute(
      'type',
      'button'
    );
  });

  it('renders an anchor when href is provided', () => {
    render(
      <InlineIconButton href='/items/1' aria-label='Open item'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    expect(screen.getByRole('link', { name: 'Open item' })).toHaveAttribute(
      'href',
      '/items/1'
    );
  });

  it('uses the fade visibility class when fadeOnParentHover is enabled', () => {
    render(
      <InlineIconButton fadeOnParentHover aria-label='Remove item'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    expect(screen.getByRole('button', { name: 'Remove item' })).toHaveClass(
      ...INLINE_ICON_BUTTON_FADE_CLASSNAME.split(' ')
    );
  });

  it('uses the visible visibility class by default', () => {
    render(
      <InlineIconButton aria-label='Copy item'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    expect(screen.getByRole('button', { name: 'Copy item' })).toHaveClass(
      ...INLINE_ICON_BUTTON_VISIBLE_CLASSNAME.split(' ')
    );
  });

  it('calls onClick when activated', () => {
    const handleClick = vi.fn();

    render(
      <InlineIconButton aria-label='Refresh item' onClick={handleClick}>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh item' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <InlineIconButton aria-label='Accessible inline icon'>
        <svg aria-hidden='true' />
      </InlineIconButton>
    );

    await expectNoA11yViolations(container);
  });
});
