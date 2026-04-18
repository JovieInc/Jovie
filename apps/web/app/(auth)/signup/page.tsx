import { unstable_noStore as noStore } from 'next/cache';
import { UnavailablePage } from '@/components/UnavailablePage';
import { getOperationalControls } from '@/lib/admin/operational-controls';
import { SignUpPageClient } from './SignUpPageClient';

export default async function SignUpPage() {
  noStore();

  const controls = await getOperationalControls();
  if (!controls.signupEnabled) {
    return <UnavailablePage />;
  }

  return <SignUpPageClient />;
}
