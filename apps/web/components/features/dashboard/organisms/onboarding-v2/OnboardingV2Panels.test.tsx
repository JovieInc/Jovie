import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  EmptyState,
  FlatPanel,
  OnboardingSidebar,
  StepFrame,
} from './OnboardingV2Panels';

const STEPS = [
  { id: 'handle', label: 'Handle' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'profile-ready', label: 'Finish' },
] as const;

describe('OnboardingV2Panels', () => {
  it('marks the current step and goes back with the ghost button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const { container } = render(
      <OnboardingSidebar currentStep='spotify' onBack={onBack} steps={STEPS} />
    );

    expect(screen.getAllByText('Spotify').length).toBeGreaterThan(0);
    const current = container.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Spotify');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back button on the first step', () => {
    render(<OnboardingSidebar currentStep='handle' steps={STEPS} />);
    expect(screen.queryByRole('button', { name: 'Go Back' })).toBeNull();
  });

  it('frames a step with its title, prompt, content and actions', async () => {
    const { container } = render(
      <StepFrame
        title='Review DSP matches'
        prompt='Checking other platforms.'
        actions={<button type='button'>Refresh</button>}
      >
        <FlatPanel>Panel body</FlatPanel>
        <EmptyState title='Nothing yet' body='Nothing was found.' />
      </StepFrame>
    );

    expect(
      screen.getByRole('heading', { name: 'Review DSP matches' })
    ).toBeInTheDocument();
    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
