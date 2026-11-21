import { OnboardingV2DiscoveryStep } from './OnboardingV2DiscoverySteps';
import { OnboardingV2EarlyStep } from './OnboardingV2EarlySteps';
import { OnboardingV2ProfileReadyStep } from './OnboardingV2ProfileReadyStep';
import type { OnboardingV2StepContext } from './onboardingV2StepContext';

export function OnboardingV2StepContent({
  ctx,
}: Readonly<{ ctx: OnboardingV2StepContext }>) {
  switch (ctx.currentStep) {
    case 'handle':
    case 'spotify':
    case 'artist-confirm':
    case 'upgrade':
      return <OnboardingV2EarlyStep ctx={ctx} />;
    case 'dsp':
    case 'social':
    case 'releases':
    case 'late-arrivals':
      return <OnboardingV2DiscoveryStep ctx={ctx} />;
    case 'profile-ready':
      return <OnboardingV2ProfileReadyStep ctx={ctx} />;
    default:
      return null;
  }
}
