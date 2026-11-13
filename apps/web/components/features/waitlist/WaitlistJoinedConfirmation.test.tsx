import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistJoinedConfirmation } from './WaitlistJoinedConfirmation';

describe('WaitlistJoinedConfirmation', () => {
  it('echoes the email and says what happens next', async () => {
    const { container } = render(
      <WaitlistJoinedConfirmation email='maya@example.com' />
    );
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
    await expectNoA11yViolations(container);
  });

  it('names the artist they confirmed', async () => {
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });

  it('exposes a focusable status region through the confirmation ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <WaitlistJoinedConfirmation
        email='maya@example.com'
        confirmationRef={ref}
        headingLevel={1}
        className='mt-4'
      />
    );

    const status = screen.getByRole('status');
    expect(ref.current).toBe(status);
    expect(status).toHaveAttribute('tabindex', '-1');
    expect(status).toHaveClass('mt-4');
    ref.current?.focus();
    expect(status).toHaveFocus();
    expect(
      screen.getByRole('heading', { level: 1, name: "You're on the waitlist." })
    ).toBeVisible();
  });

  it('trims the artist name and stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <WaitlistJoinedConfirmation
          email='maya@example.com'
          artistName='  مايا فيل  '
        />
      </div>
    );

    expect(
      screen.getByTestId('waitlist-role-form-joined-artist')
    ).toHaveTextContent('Your request is for مايا فيل.');
    await expectNoA11yViolations(container);
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
