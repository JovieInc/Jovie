import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistJoinedConfirmation } from './WaitlistJoinedConfirmation';

describe('WaitlistJoinedConfirmation', () => {
  it('echoes the email and says what happens next', () => {
    render(<WaitlistJoinedConfirmation email='maya@example.com' />);
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: "You're on the waitlist.",
      })
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      "We'll email maya@example.com when your spot opens."
    );
    expect(
      screen.queryByTestId('waitlist-role-form-joined-artist')
    ).not.toBeInTheDocument();
  });

  it('names the artist they confirmed', () => {
    render(
      <WaitlistJoinedConfirmation
        email='maya@example.com'
        artistName='Maya Vale'
        headingLevel={2}
      />
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: "You're on the waitlist.",
      })
    ).toBeVisible();
    expect(
      screen.getByTestId('waitlist-role-form-joined-artist')
    ).toHaveTextContent('Your request is for Maya Vale.');
  });

  it('leaves the artist line out when the name is blank', () => {
    render(
      <WaitlistJoinedConfirmation email='maya@example.com' artistName='  ' />
    );
    expect(
      screen.queryByTestId('waitlist-role-form-joined-artist')
    ).not.toBeInTheDocument();
  });
});
