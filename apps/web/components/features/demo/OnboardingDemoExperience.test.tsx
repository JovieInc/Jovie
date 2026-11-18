import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingDemoExperience } from './OnboardingDemoExperience';

describe('OnboardingDemoExperience certificate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the handle step and keeps typed input', async () => {
    const user = userEvent.setup();
    const { container } = render(<OnboardingDemoExperience />);

    expect(
      screen.getByTestId('demo-onboarding-experience-shell')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Claim your link' })
    ).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('soravale');
    await user.clear(input);
    await user.type(input, 'newhandle');
    expect(input).toHaveValue('newhandle');
    await expectNoA11yViolations(container);
  });

  it('switches steps from the top bar and the footer dots', async () => {
    const user = userEvent.setup();
    const { container } = render(<OnboardingDemoExperience />);

    await user.click(screen.getByRole('button', { name: 'Spotify' }));
    expect(
      screen.getByRole('heading', { name: 'Are you on Spotify?' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Step 3' }));
    expect(
      screen.getByRole('heading', { name: 'Your link is live' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Step 1' }));
    expect(
      screen.getByRole('heading', { name: 'Claim your link' })
    ).toBeInTheDocument();
  });

  it('fades out and unmounts the flow after finishing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OnboardingDemoExperience />);

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    const finish = screen
      .getAllByRole('button')
      .find(b => /dashboard/i.test(b.textContent ?? ''));
    expect(finish).toBeDefined();
    await user.click(finish as HTMLElement);

    expect(screen.getByTestId('demo-onboarding-experience-shell')).toHaveClass(
      'opacity-0',
      'pointer-events-none'
    );
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByTestId('demo-onboarding-experience-shell')).toBeNull();
  });
});
