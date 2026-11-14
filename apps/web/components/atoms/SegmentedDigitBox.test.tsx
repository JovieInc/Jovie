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
    expect(box.className).not.toMatch(/\b(?:border|ring)-red-\d/);
  });

  it('does not tint the box when there is no error', () => {
    const { container } = render(<SegmentedDigitBox {...BASE_PROPS} />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).not.toContain('border-error');
  });

  it('reports typing, keys, focus and blur with the box index', async () => {
    const user = userEvent.setup();
    const handlers = {
      onInputChange: vi.fn(),
      onKeyDown: vi.fn(),
      onInput: vi.fn(),
      onFocus: vi.fn(),
      onBlur: vi.fn(),
    };
    render(
      <SegmentedDigitBox {...BASE_PROPS} {...handlers} digit='' index={3} />
    );

    const input = screen.getByLabelText('Digit 1 of 6');
    await user.type(input, '5');
    await user.tab();

    expect(handlers.onFocus).toHaveBeenCalledWith(3);
    expect(handlers.onInputChange).toHaveBeenCalledWith(3, '5');
    expect(handlers.onKeyDown).toHaveBeenCalledWith(3, expect.anything());
    expect(handlers.onInput).toHaveBeenCalledWith(3, expect.anything());
    expect(handlers.onBlur).toHaveBeenCalledTimes(1);
  });

  it('hands a paste to the parent', () => {
    const onPaste = vi.fn();
    render(<SegmentedDigitBox {...BASE_PROPS} onPaste={onPaste} />);

    fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), {
      clipboardData: { getData: () => '123456' },
    });

    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed digit and focus when the parent re-renders', async () => {
    const user = userEvent.setup();
    // Props-driven parent: every change and focus event re-renders the box
    // with new props, as OtpInput does.
    const state = { digit: '', focused: false };
    const ui = () => (
      <SegmentedDigitBox
        {...BASE_PROPS}
        digit={state.digit}
        isFocused={state.focused}
        onInputChange={(_, value) => {
          state.digit = value.slice(-1);
          view.rerender(ui());
        }}
        onFocus={() => {
          state.focused = true;
          view.rerender(ui());
        }}
        onBlur={() => {
          state.focused = false;
          view.rerender(ui());
        }}
      />
    );
    const view = render(ui());

    const input = screen.getByLabelText('Digit 1 of 6');
    await user.type(input, '8');
    await user.keyboard('{Escape}');

    expect(input).toHaveValue('8');
    expect(input).toHaveFocus();
  });

  it('shows the caret only while focused and empty', () => {
    const { container, rerender } = render(
      <SegmentedDigitBox {...BASE_PROPS} digit='' isFocused />
    );
    expect(container).toHaveTextContent('|');

    rerender(<SegmentedDigitBox {...BASE_PROPS} digit='4' isFocused />);
    expect(container).not.toHaveTextContent('|');
    expect(container).toHaveTextContent('4');
  });

  it('disables the input and passes the invalid and described-by state through', () => {
    render(
      <SegmentedDigitBox
        {...BASE_PROPS}
        disabled
        ariaInvalid
        ariaDescribedBy='otp-error'
        autoComplete='one-time-code'
      />
    );

    const input = screen.getByLabelText('Digit 1 of 6');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'otp-error');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('has no accessibility violations empty, filled, in error or disabled', async () => {
    const { container, rerender } = render(
      <SegmentedDigitBox {...BASE_PROPS} digit='' isFocused />
    );
    await expectNoA11yViolations(container);

    rerender(<SegmentedDigitBox {...BASE_PROPS} />);
    await expectNoA11yViolations(container);

    rerender(<SegmentedDigitBox {...BASE_PROPS} error ariaInvalid />);
    await expectNoA11yViolations(container);

    rerender(<SegmentedDigitBox {...BASE_PROPS} disabled />);
    await expectNoA11yViolations(container);
  });
});

describe('SegmentedDigitBox focus ring', () => {
  it('draws the focused ring from the canonical focus token', () => {
    const { container } = render(
      <SegmentedDigitBox {...BASE_PROPS} isFocused />
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('ring-2');
    expect(box.className).toContain('ring-focus/18');
    // --focus-ring is defined nowhere; a ring keyed to it has no colour.
    expect(box.className).not.toContain('var(--focus-ring)');
  });
});
