import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Redirects to the canonical admin feature-flags workspace.',
};

/** Redirect-only compatibility route; OV owns the feature-flags surface. */
export default function LegacyFeatureFlagsPage() {
  redirect(APP_ROUTES.ADMIN_FEATURES);
}
