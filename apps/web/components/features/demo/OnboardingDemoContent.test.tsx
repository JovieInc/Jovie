import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type DemoOnboardingStepId,
  OnboardingDemoContent,
} from './OnboardingDemoContent';

function renderContent(
  step: DemoOnboardingStepId,
  overrides: { isRevealing?: boolean } = {}
) {
  const onStepChange = vi.fn();
  const onFinish = vi.fn();
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <OnboardingDemoContent
        currentStep={step}
        onStepChange={onStepChange}
        isRevealing={overrides.isRevealing ?? false}
        onFinish={onFinish}
      />
    </QueryClientProvider>
  );
  return { ...view, onStepChange, onFinish };
}

describe('OnboardingDemoContent', () => {
  it('renders the handle step with the demo handle and no accessibility violations', async () => {
    const { container } = renderContent('handle');

    expect(
      screen.getByRole('heading', { name: 'Claim your link' })
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('soravale');
    await expectNoA11yViolations(container);
  });

  it('switches steps from the top bar and the footer dots through plain buttons', async () => {
    const user = userEvent.setup();
    const { onStepChange } = renderContent('handle');

    const spotify = screen.getByRole('button', { name: 'Spotify' });
    expect(spotify).toHaveAttribute('data-slot', 'plain-button');
    await user.click(spotify);
    expect(onStepChange).toHaveBeenLastCalledWith('dsp');

    await user.click(screen.getByRole('button', { name: 'Step 3' }));
    expect(onStepChange).toHaveBeenLastCalledWith('profile-review');
  });

  it('keeps typed handle input across re-renders', async () => {
    const user = userEvent.setup();
    const { rerender, onStepChange, onFinish } = renderContent('handle');

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'newhandle');
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <OnboardingDemoContent
          currentStep='handle'
          onStepChange={onStepChange}
          isRevealing={false}
          onFinish={onFinish}
        />
      </QueryClientProvider>
    );
    expect(screen.getByRole('textbox')).toHaveValue('newhandle');
  });

  it('shows the Spotify and finish steps without accessibility violations', async () => {
    const dsp = renderContent('dsp');
    expect(
      screen.getByRole('heading', { name: 'Are you on Spotify?' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(dsp.container);
    dsp.unmount();

    const review = renderContent('profile-review');
    expect(
      screen.getByRole('heading', { name: 'Your link is live' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(review.container);
  });

  it('fades the flow out and blocks pointer events while revealing', () => {
    renderContent('handle', { isRevealing: true });

    expect(screen.getByTestId('demo-onboarding-experience-shell')).toHaveClass(
      'opacity-0',
      'pointer-events-none'
    );
  });
});
