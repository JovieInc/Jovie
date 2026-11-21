import { Button } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingExperienceShell } from './OnboardingExperienceShell';

describe('OnboardingExperienceShell', () => {
  it('renders only the stage when optional regions are omitted', async () => {
    const { container } = render(
      <OnboardingExperienceShell data-testid='shell'>
        <h1>Claim your handle</h1>
      </OnboardingExperienceShell>
    );

    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-onboarding-visual-variant',
      'default'
    );
    expect(screen.getByTestId('onboarding-stage-framed')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders sidebar, top bar, side panel and footer around the stage', async () => {
    const { container } = render(
      <OnboardingExperienceShell
        sidebarTitle='Jovie Setup'
        sidebar={<nav aria-label='Steps'>Steps</nav>}
        topBar={<div>Top bar</div>}
        sidePanel={<div>Side panel</div>}
        footer={<div>Footer</div>}
        stageVariant='flat'
      >
        <h1>Stage</h1>
      </OnboardingExperienceShell>
    );

    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByText('Jovie Setup')).toBeInTheDocument();
    expect(screen.getByText('Top bar')).toBeInTheDocument();
    expect(screen.getByText('Side panel')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-stage-flat')).toHaveAttribute(
      'data-stage-variant',
      'flat'
    );
    await expectNoA11yViolations(container);
  });

  it('uses the base token and no raw glow for the v1 variant', () => {
    render(
      <OnboardingExperienceShell visualVariant='v1' data-testid='shell'>
        <h1>Stage</h1>
      </OnboardingExperienceShell>
    );

    const root = screen.getByTestId('shell');
    expect(root).toHaveClass('bg-base');
    expect(root.className).not.toContain('rgba');
    expect(root.className).not.toContain('radial-gradient');
  });

  it('keeps stage controls interactive', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <OnboardingExperienceShell>
        <Button type='button' onClick={onContinue}>
          Continue
        </Button>
      </OnboardingExperienceShell>
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
