import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';

describe('OnboardingExperienceShell', () => {
  it('renders standalone mode with reserved side content and footer', () => {
    const { container } = render(
      <OnboardingExperienceShell
        mode='standalone'
        stableStageHeight='tall'
        sidebar={<nav>Step Navigation</nav>}
        sidebarTitle='Jovie Setup'
        topBar={<div>Top Bar</div>}
        sidePanel={<aside>Preview Panel</aside>}
        footer={<div>Footer Dots</div>}
        data-testid='onboarding-shell'
      >
        <div>Onboarding Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByTestId('onboarding-shell')).toBeInTheDocument();
    expect(screen.getByText('Top Bar')).toBeInTheDocument();
    expect(screen.getByText('Jovie Setup')).toBeInTheDocument();
    expect(screen.getByText('Step Navigation')).toBeInTheDocument();
    expect(screen.getByText('Preview Panel')).toBeInTheDocument();
    expect(screen.getByText('Footer Dots')).toBeInTheDocument();
    expect(screen.getByText('Onboarding Stage')).toBeInTheDocument();
    expect(container.innerHTML).toContain('min-h-screen');
    expect(container.innerHTML).toContain('min-h-[560px]');
  });

  it('supports a flat stage surface', () => {
    render(
      <OnboardingExperienceShell mode='standalone' stageVariant='flat'>
        <div>Flat Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByText('Flat Stage')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-stage-flat')).toHaveAttribute(
      'data-stage-variant',
      'flat'
    );
  });

  it('supports embedded mode without fullscreen classes', () => {
    const { container } = render(
      <OnboardingExperienceShell mode='embedded'>
        <div>Embedded Stage</div>
      </OnboardingExperienceShell>
    );

    expect(screen.getByText('Embedded Stage')).toBeInTheDocument();
    expect(container.innerHTML).toContain('flex min-h-0 flex-1 flex-col');
    expect(container.innerHTML).toContain('min-h-[520px]');
  });
});
