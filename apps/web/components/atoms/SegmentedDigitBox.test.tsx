import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SegmentedDigitBox } from './SegmentedDigitBox';

const BASE_PROPS = {
  digit: '9',
  isFocused: false,
  index: 0,
  inputRef: vi.fn(),
  onInputChange: vi.fn(),
  onKeyDown: vi.fn(),
  onInput: vi.fn(),
  onFocus: vi.fn(),
  onBlur: vi.fn(),
  ariaLabel: 'Digit 1 of 6',
  boxSizeClassName: 'h-12 w-11 sm:h-12 sm:w-12',
  textSizeClassName: 'text-lg sm:text-xl',
};

describe('SegmentedDigitBox', () => {
  it('renders the error state with the error token, not raw red-* (JOV-6773)', () => {
    const { container } = render(<SegmentedDigitBox {...BASE_PROPS} error />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('border-error/55');
    expect(box.className).toContain('ring-error/14');
    expect(box.className).toContain('bg-pearl-error');
    expect(box.className).not.toMatch(/\b(?:border|ring)-red-\d/);
  });

  it('does not tint the box when there is no error', () => {
    const { container } = render(<SegmentedDigitBox {...BASE_PROPS} />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).not.toContain('border-error');
    expect(box.className).not.toContain('bg-pearl-error');
  });

  it('paints the focus ring on the box, since the field draws none', () => {
    const { container } = render(
      <SegmentedDigitBox {...BASE_PROPS} isFocused />
    );
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveClass('ring-2', 'ring-current');
    expect(screen.getByRole('textbox')).toHaveClass('outline-none');
  });

  it('shows the caret only while focused and empty', () => {
    const { container, rerender } = render(
      <SegmentedDigitBox {...BASE_PROPS} digit='' isFocused />
    );
    expect(container).toHaveTextContent('|');
    rerender(<SegmentedDigitBox {...BASE_PROPS} digit='3' isFocused />);
    expect(container).not.toHaveTextContent('|');
    expect(container).toHaveTextContent('3');
  });

  it('passes its index to every handler', async () => {
    const user = userEvent.setup();
    const props = {
      ...BASE_PROPS,
      digit: '',
      index: 2,
      onInputChange: vi.fn(),
      onKeyDown: vi.fn(),
      onInput: vi.fn(),
      onFocus: vi.fn(),
      onBlur: vi.fn(),
      onPaste: vi.fn(),
    };
    render(<SegmentedDigitBox {...props} />);
    const input = screen.getByRole('textbox', { name: 'Digit 1 of 6' });

    await user.type(input, '5');
    expect(props.onFocus).toHaveBeenCalledWith(2);
    expect(props.onKeyDown).toHaveBeenCalledWith(2, expect.anything());
    expect(props.onInput).toHaveBeenCalledWith(2, expect.anything());
    expect(props.onInputChange).toHaveBeenCalledWith(2, '5');

    fireEvent.paste(input);
    expect(props.onPaste).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(props.onBlur).toHaveBeenCalledTimes(1);
  });

  it('wires the numeric field and its accessible state', () => {
    render(
      <SegmentedDigitBox
        {...BASE_PROPS}
        autoComplete='one-time-code'
        ariaDescribedBy='otp-error'
        ariaInvalid
      />
    );
    const input = screen.getByRole('textbox', { name: 'Digit 1 of 6' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('pattern', '[0-9]*');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'otp-error');
    expect(input).toHaveClass('text-lg', 'sm:text-xl');
  });

  it('dims and locks the box while disabled', () => {
    const { container } = render(
      <SegmentedDigitBox {...BASE_PROPS} disabled />
    );
    expect(container.firstElementChild).toHaveClass(
      'opacity-50',
      'cursor-not-allowed'
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('keeps the typed digit and focus across a rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    const props = { ...BASE_PROPS, digit: '', onInputChange };
    const { rerender } = render(<SegmentedDigitBox {...props} />);
    const input = screen.getByRole('textbox', { name: 'Digit 1 of 6' });

    await user.type(input, '8');
    expect(onInputChange).toHaveBeenLastCalledWith(0, '8');
    // The owner stores the digit and re-renders the box with it.
    rerender(<SegmentedDigitBox {...props} digit='8' isFocused />);
    expect(input).toHaveValue('8');

    // An unrelated parent update (here the error flag) keeps the same field.
    rerender(<SegmentedDigitBox {...props} digit='8' isFocused error />);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(input).toHaveValue('8');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('8');
    expect(input).toHaveFocus();

    fireEvent.blur(input);
    expect(input).toHaveValue('8');
  });

  it('has no axe violations in each rendered state', async () => {
    const states = [
      { digit: '' },
      { digit: '', isFocused: true },
      { digit: '4' },
      { digit: '9', error: true, ariaInvalid: true },
      { digit: '2', disabled: true },
    ];
    for (const state of states) {
      const { container, unmount } = render(
        <SegmentedDigitBox {...BASE_PROPS} {...state} />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
  });

  it('has no axe violations in a right-to-left row', async () => {
    const { container } = render(
      <fieldset dir='rtl'>
        <legend>رمز التحقق</legend>
        <SegmentedDigitBox {...BASE_PROPS} digit='1' />
        <SegmentedDigitBox
          {...BASE_PROPS}
          digit=''
          index={1}
          ariaLabel='Digit 2 of 6'
        />
      </fieldset>
    );
    await expectNoA11yViolations(container);
  });
});
