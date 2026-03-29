import { APP_ROUTES } from '@/constants/routes';
import { HeroCinematic } from '@/features/home/HeroCinematic';
import { LandingCTAButton } from './LandingCTAButton';

export function LandingHero() {
  return (
    <HeroCinematic
      primaryAction={
        <LandingCTAButton
          href={APP_ROUTES.SIGNUP}
          label='Get started'
          eventName='landing_cta_get_started'
          section='hero'
        />
      }
    />
  );
}
