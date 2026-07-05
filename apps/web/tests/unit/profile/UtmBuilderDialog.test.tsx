import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UtmBuilderDialog } from '@/features/profile/UtmBuilderDialog';

const copyToClipboard = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@/hooks/useClipboard', () => ({ copyToClipboard }));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('UtmBuilderDialog', () => {
  const baseUrl = 'https://jov.ie/tim';

  it('shows the bare URL until params are entered', () => {
    render(<UtmBuilderDialog open onClose={vi.fn()} baseUrl={baseUrl} />);
    expect(screen.getByText(baseUrl)).toBeInTheDocument();
  });

  it('appends only non-empty utm params and copies the result', async () => {
    render(<UtmBuilderDialog open onClose={vi.fn()} baseUrl={baseUrl} />);

    fireEvent.change(screen.getByLabelText(/source/i), {
      target: { value: 'instagram' },
    });
    fireEvent.change(screen.getByLabelText(/campaign/i), {
      target: { value: 'summer tour' },
    });

    // Empty fields (medium/term/content) must be omitted; spaces are encoded.
    const expected =
      'https://jov.ie/tim?utm_source=instagram&utm_campaign=summer+tour';
    expect(screen.getByText(expected)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    expect(copyToClipboard).toHaveBeenCalledWith(expected);
  });
});
