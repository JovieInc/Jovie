import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

describe('ChangelogEmailSignup', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('expands the composer when the CTA button is clicked', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    expect(revealRoot).toHaveAttribute('data-visual-state', 'collapsed');

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    expect(revealRoot).toHaveAttribute('data-visual-state', 'expanded');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('you@example.com')).toHaveFocus();
    });
  });

  it('collapses back to the CTA when the expanded shell blurs with an empty email', async () => {
    const { container } = render(<ChangelogEmailSignup />);
    const revealRoot = container.querySelector("[data-ui='cta-reveal']");
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const input = screen.getByPlaceholderText('you@example.com');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    outsideButton.focus();

    await waitFor(() => {
      expect(revealRoot).toHaveAttribute('data-visual-state', 'collapsed');
    });

    outsideButton.remove();
  });

  it('keeps the shell open and shows the success state after submit', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok' }),
    } as Response);

    render(<ChangelogEmailSignup />);

    fireEvent.click(screen.getByTestId('changelog-reveal-button'));

    const input = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.submit(screen.getByTestId('changelog-reveal-form'));

    await waitFor(() => {
      expect(screen.getByTestId('changelog-success-message')).toBeVisible();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/changelog/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        turnstileToken: '',
        source: 'changelog_page',
      }),
    });
  });
});
