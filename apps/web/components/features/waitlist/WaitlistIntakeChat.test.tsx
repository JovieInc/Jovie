import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistIntakeChat } from './WaitlistIntakeChat';

afterEach(() => vi.unstubAllGlobals());

describe('WaitlistIntakeChat', () => {
  it('shows the signed-in email in the header on the tertiary text token', async () => {
    const { container } = render(
      <WaitlistIntakeChat userEmail='artist@example.com' />
    );
    const email = screen.getByText('artist@example.com');
    expect(email).toHaveClass('text-tertiary-token');
    expect(container.innerHTML).not.toMatch(/text-white|border-white|bg-white/);
    await expectNoA11yViolations(container);
  });

  it('names the answer field after the current prompt and the send button by action', () => {
    render(<WaitlistIntakeChat userEmail={null} />);
    expect(screen.queryByText('artist@example.com')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Send answer' })
    ).toBeInTheDocument();
    const terms = document.querySelectorAll('dt');
    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) {
      expect(term).toHaveClass('text-tertiary-token');
    }
  });

  it('draws the answer field as a host-drawn input in the shared shell', async () => {
    const user = userEvent.setup();
    const { container } = render(<WaitlistIntakeChat userEmail={null} />);

    const input = screen.getByRole('textbox', {
      name: 'What handle should people use to find you?',
    });
    expect(input).toHaveAttribute('data-host-drawn');
    expect(input.closest('[data-component="composite-field"]')).toHaveAttribute(
      'data-surface',
      'field'
    );
    await user.type(input, '@artist');
    expect(input).toHaveValue('@artist');
    await expectNoA11yViolations(container);
  });

  it('rejects a short acknowledgement and keeps the field after the error', async () => {
    const user = userEvent.setup();
    const { container } = render(<WaitlistIntakeChat userEmail={null} />);

    await user.type(screen.getByRole('textbox'), 'k');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('text-error');
    expect(screen.getByRole('textbox')).toHaveValue('k');
    await expectNoA11yViolations(container);
  });

  it('offers Skip on optional steps through the design system button', async () => {
    const user = userEvent.setup();
    render(<WaitlistIntakeChat userEmail={null} />);

    await user.type(screen.getByRole('textbox'), 'artist');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await user.type(
      screen.getByRole('textbox'),
      'https://instagram.com/artist'
    );
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip).toHaveAttribute('data-variant', 'secondary');
    await user.click(skip);
    expect(
      screen.getByRole('textbox', {
        name: 'What artist name should Jovie use for your release context?',
      })
    ).toBeInTheDocument();
  });
});
