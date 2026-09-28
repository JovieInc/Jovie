import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description:
    'Redirects to certifications, which replaced manual flag toggling.',
};

/** Redirect-only compatibility route; certification-driven rollout owns rollout state. */
export default function LegacyFeatureFlagsPage() {
  redirect(APP_ROUTES.ADMIN_CERTIFICATIONS);
}
