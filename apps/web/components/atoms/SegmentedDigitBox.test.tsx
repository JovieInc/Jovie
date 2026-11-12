import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});

describe('SegmentedDigitBox design tokens', () => {
  it('takes its resting shadow from the profile pearl surface token', () => {
    const { container } = render(<SegmentedDigitBox {...BASE_PROPS} />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('shadow-(--profile-pearl-shadow)');
    expect(box.className).not.toMatch(/rgba?\(/);
  });

  it('draws the focused ring from the canonical focus token', () => {
    const { container } = render(
      <SegmentedDigitBox {...BASE_PROPS} isFocused />
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('ring-2');
    expect(box.className).toContain('ring-focus/18');
    expect(box.className).not.toContain('var(--focus-ring)');
  });

  it('marks the error state with error tokens only, no raw colour', () => {
    const { container } = render(<SegmentedDigitBox {...BASE_PROPS} error />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('border-error/55');
    expect(box.className).toContain('ring-error/14');
    expect(box.className).not.toMatch(/rgba?\(/);
  });
});
