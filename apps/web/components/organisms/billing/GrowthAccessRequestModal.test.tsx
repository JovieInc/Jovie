import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GrowthAccessRequestModal } from './GrowthAccessRequestModal';

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/queries', () => ({
  useGrowthAccessRequestMutation: () => mutation,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mutation.isPending = false;
});

describe('GrowthAccessRequestModal', () => {
  it('uses one early-access status and semantic color tokens', () => {
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole('heading', { name: 'Request Early Access' })
    ).toBeInTheDocument();
    expect(screen.getByText('Tell us what you want from Growth.')).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('What would you use Growth for?')
    ).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/violet-|emerald-/);
    expect(document.body.innerHTML).toContain('bg-accent/10');
  });

  it('keeps the submit action disabled until a reason is typed, then sends it trimmed', async () => {
    const user = userEvent.setup();
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Request Early Access' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '  Smart links for tours ');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(mutation.mutate).toHaveBeenCalledWith(
      { reason: 'Smart links for tours' },
      expect.any(Object)
    );
    expect(track).toHaveBeenCalledWith('growth_access_requested', {
      reason_length: 21,
    });
  });

  it('keeps the typed reason and focus across a rerender, tab', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <GrowthAccessRequestModal open onOpenChange={onOpenChange} />
    );
    const field = screen.getByRole('textbox');
    await user.type(field, 'Playlist pitching');

    rerender(<GrowthAccessRequestModal open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('Playlist pitching');
    expect(screen.getByRole('textbox')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('textbox')).toHaveValue('Playlist pitching');
  });

  it('shows the confirmation after the request succeeds and closes from it', async () => {
    mutation.mutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.()
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<GrowthAccessRequestModal open onOpenChange={onOpenChange} />);
    await user.type(screen.getByRole('textbox'), 'Fan growth');
    await user.click(
      screen.getByRole('button', { name: 'Request Early Access' })
    );

    expect(
      screen.getByRole('heading', { name: 'Request Received' })
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('growth_access_request_success');
    await expectNoA11yViolations(document.body);
    const closers = screen.getAllByRole('button', { name: 'Close' });
    await user.click(closers[closers.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables both actions while the request is pending', async () => {
    mutation.isPending = true;
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Submitting/ })).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });

  it('closes from Cancel and stays axe-clean when empty', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<GrowthAccessRequestModal open onOpenChange={onOpenChange} />);
    await expectNoA11yViolations(document.body);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('accepts a very long reason up to the field limit', async () => {
    const user = userEvent.setup();
    render(<GrowthAccessRequestModal open onOpenChange={vi.fn()} />);
    const field = screen.getByRole('textbox');
    expect(field).toHaveAttribute('maxlength', '2000');
    await user.click(field);
    await user.paste('x'.repeat(2500));
    expect((field as HTMLTextAreaElement).value.length).toBeLessThanOrEqual(
      2000
    );
    await expectNoA11yViolations(document.body);
  });
});
