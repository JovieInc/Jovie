import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Redirects to the canonical admin feature-flags workspace.',
};

export default function LegacyFeatureFlagsPage() {
  redirect(APP_ROUTES.ADMIN_FEATURES);
}
