import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from '@/features/auth/atoms/otp-input';

vi.mock('@/hooks/useHapticFeedback', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  }),
}));

describe('OtpInput — hero size', () => {
  it('renders digit boxes at hero dimensions (h-8 w-[26px])', () => {
    render(<OtpInput size='hero' aria-label='Enter code' />);

    const firstCell = screen.getByLabelText('Digit 1 of 6');
    // The input itself is invisible in the segmented layout; the sized shell
    // is the nearest ancestor with boxSize classes. Assert both dimensions.
    const shell = firstCell.closest('div');
    expect(shell?.className).toMatch(/\bh-8\b/);
    expect(shell?.className).toMatch(/w-\[26px\]/);
  });

  it('still supports the default and compact sizes', () => {
    const { rerender } = render(<OtpInput size='default' aria-label='x' />);
    let shell = screen.getByLabelText('Digit 1 of 6').closest('div');
    expect(shell?.className).toMatch(/\bh-12\b/);

    rerender(<OtpInput size='compact' aria-label='x' />);
    shell = screen.getByLabelText('Digit 1 of 6').closest('div');
    expect(shell?.className).toMatch(/\bh-10\b/);
  });
});
