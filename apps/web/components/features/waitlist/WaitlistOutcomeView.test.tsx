import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for each WaitlistOutcomeView outcome. The
// reserved-handle copy contract lives in
// tests/unit/components/features/waitlist/WaitlistOutcomeView.test.tsx.
const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: signOutMock }),
}));

import { WaitlistOutcomeView } from './WaitlistOutcomeView';

describe('WaitlistOutcomeView states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the pending receipt with next steps and the resume link', async () => {
    const { container } = render(
      <WaitlistOutcomeView outcome='pending' email='artist@example.com' />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: "You're on the waitlist." })
    ).toBeInTheDocument();
    expect(screen.getByTestId('waitlist-next-steps')).toHaveTextContent(
      'Watch artist@example.com for the access email.'
    );
    expect(screen.getByTestId('waitlist-resume-start')).toHaveAttribute(
      'href',
      APP_ROUTES.START
    );
    expect(
      screen.queryByRole('button', { name: 'Sign Out' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the receipt copy on the fixed on-media white over its dark card', () => {
    const { container } = render(
      <WaitlistOutcomeView outcome='pending' email='artist@example.com' />
    );

    expect(screen.getByText(/request is saved/i)).toHaveClass(
      'text-on-media/62'
    );
    expect(screen.getByTestId('waitlist-next-steps')).toHaveClass(
      'text-on-media/62'
    );
    expect(screen.getByRole('link', { name: '/start' })).toHaveClass(
      'text-on-media/86'
    );
    const card = container.querySelector('section');
    expect(card).toHaveClass('border-on-media/[0.08]');
    expect(card?.innerHTML).not.toMatch(/\b(?:text|bg|border)-white\b/);
  });

  it('asks for a contact email when the receipt has none', async () => {
    const { container } = render(<WaitlistOutcomeView outcome='pending' />);

    expect(screen.getByTestId('waitlist-next-steps')).toHaveTextContent(
      'Add a contact email at sign-in'
    );
    expect(screen.getByText(/Come back to \/start/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('sends an accepted request to setup', async () => {
    const { container } = render(<WaitlistOutcomeView outcome='accepted' />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'You Have Access' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Continue Setup' })
    ).toHaveAttribute('href', APP_ROUTES.START);
    expect(screen.queryByTestId('waitlist-next-steps')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('retries a failed save from the Try Again button and still offers sign-out', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <WaitlistOutcomeView outcome='save_failed' onRetry={onRetry} />
    );

    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    const signOut = screen.getByRole('button', { name: 'Sign Out' });
    expect(signOut).toHaveClass('text-on-media/74', 'sm:ml-auto');
    // The muted label replaces the secondary variant's foreground, as before.
    expect(signOut).not.toHaveClass('text-btn-secondary-foreground');
    await user.click(signOut);
    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: APP_ROUTES.HOME });
    await expectNoA11yViolations(container);
  });

  it('offers only sign-out when the receipt cannot be verified', async () => {
    const { container } = render(
      <WaitlistOutcomeView outcome='receipt_unavailable' onRetry={vi.fn()} />
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "We Couldn't Verify Your Request",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try Again' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Out' })).not.toHaveClass(
      'sm:ml-auto'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for a long contact email in a right-to-left page', async () => {
    const email = 'booking.and.management.team@example-records-group.com';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WaitlistOutcomeView outcome='waitlisted_capacity_full' email={email} />
      </div>
    );

    expect(screen.getByTestId('waitlist-next-steps')).toHaveTextContent(email);
    await expectNoA11yViolations(container);
  });
});
