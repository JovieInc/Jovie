import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthUnavailableCard } from './AuthUnavailableCard';

const pathname = vi.hoisted(() => ({ value: '/signin' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

describe('AuthUnavailableCard', () => {
  beforeEach(() => {
    pathname.value = '/signin';
  });

  it('renders the sign-in state with media-fixed colour tokens', async () => {
    const { container } = render(<AuthUnavailableCard />);

    const heading = screen.getByRole('heading', {
      name: 'Sign in is temporarily unavailable',
    });
    expect(heading.className).toContain('text-on-media');
    expect(heading.className).not.toContain('text-white');
    expect(
      screen.getByRole('link', { name: 'Go to Homepage' })
    ).toHaveAttribute('href', '/');
    expect(screen.queryByText(/By signing up/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the sign-up state with legal links', async () => {
    pathname.value = '/signup';
    const { container } = render(<AuthUnavailableCard />);

    expect(
      screen.getByRole('heading', {
        name: 'Sign up is temporarily unavailable',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Terms of Service' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('submits the reset form from the action button', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthUnavailableCard showResetAction />);
    const form = container.querySelector('form') as HTMLFormElement;
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', submit);

    await user.click(
      screen.getByRole('button', { name: 'Reset session and retry' })
    );

    expect(submit).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute('action', '/api/auth/reset');
    await expectNoA11yViolations(container);
  });
});
