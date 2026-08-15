import { notFound } from 'next/navigation';
import {
  isProfileAdmissionFixtureEnabled,
  PROFILE_ADMISSION_FIXTURE_METADATA,
} from './guard';
import { ProfileAdmissionFixtureClient } from './ProfileAdmissionFixtureClient';

export const revalidate = false;
export const metadata = PROFILE_ADMISSION_FIXTURE_METADATA;

/** Secret-free, E2E-only public-profile admission fixture. */
export default function ProfileAdmissionFixturePage() {
  if (!isProfileAdmissionFixtureEnabled()) notFound();

  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <ProfileAdmissionFixtureClient />
    </main>
  );
}
