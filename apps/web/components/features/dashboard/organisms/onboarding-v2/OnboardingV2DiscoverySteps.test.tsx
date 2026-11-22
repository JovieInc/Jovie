import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  createStepContext,
  SPARSE_SNAPSHOT,
} from './fixtures/onboardingV2StepContext';
import { OnboardingV2DiscoveryStep } from './OnboardingV2DiscoverySteps';

describe('OnboardingV2DiscoveryStep', () => {
  it('lets the artist accept or reject a suggested DSP match', async () => {
    const user = userEvent.setup();
    const handleConfirmDsp = vi.fn().mockResolvedValue(undefined);
    const handleRejectDsp = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <OnboardingV2DiscoveryStep
        ctx={createStepContext({
          currentStep: 'dsp',
          discoverySnapshot: SPARSE_SNAPSHOT,
          handleConfirmDsp,
          handleRejectDsp,
        })}
      />
    );

    expect(screen.getByText('Avery Stone')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(handleConfirmDsp).toHaveBeenCalledWith('dsp-1');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(handleRejectDsp).toHaveBeenCalledWith('dsp-1');
  });

  it('explains an empty review and refreshes on request', async () => {
    const user = userEvent.setup();
    const refreshDiscovery = vi.fn().mockResolvedValue(undefined);
    render(
      <OnboardingV2DiscoveryStep
        ctx={createStepContext({
          currentStep: 'social',
          discoverySnapshot: SPARSE_SNAPSHOT,
          refreshDiscovery,
        })}
      />
    );

    expect(screen.getByText('No social suggestions yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(refreshDiscovery).toHaveBeenCalledTimes(1);
  });

  it('shows the discovery error as an inline alert', async () => {
    const { container } = render(
      <OnboardingV2DiscoveryStep
        ctx={createStepContext({
          currentStep: 'dsp',
          discoveryError: 'Failed to load onboarding discovery.',
        })}
      />
    );

    expect(
      screen.getByText('Failed to load onboarding discovery.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('previews releases and continues once discovery is ready', async () => {
    const user = userEvent.setup();
    const advanceFromStep = vi.fn();
    render(
      <OnboardingV2DiscoveryStep
        ctx={createStepContext({
          advanceFromStep,
          currentStep: 'releases',
          discoverySnapshot: SPARSE_SNAPSHOT,
        })}
      />
    );

    expect(screen.getByText('First Light')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(advanceFromStep).toHaveBeenCalledTimes(1);
  });
});
