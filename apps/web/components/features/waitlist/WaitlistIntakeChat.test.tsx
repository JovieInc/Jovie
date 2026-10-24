import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistIntakeChat } from './WaitlistIntakeChat';

describe('WaitlistIntakeChat', () => {
  it('shows the signed-in email in the header at white/50 contrast', () => {
    render(<WaitlistIntakeChat userEmail='artist@example.com' />);
    expect(screen.getByText('artist@example.com')).toHaveClass('text-white/50');
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
      expect(term).toHaveClass('text-white/50');
    }
  });
});
