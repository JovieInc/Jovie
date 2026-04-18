'use client';

import { PublicPageErrorFallback } from '@/components/providers/PublicPageErrorFallback';
import type { ErrorProps } from '@/types/common';

export default function OnboardingError({ error }: ErrorProps) {
  return <PublicPageErrorFallback error={error} context='Onboarding' />;
}
