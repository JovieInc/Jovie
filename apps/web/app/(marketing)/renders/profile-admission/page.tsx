import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { isProfileAdmissionFixtureEnabled } from './guard';
import { ProfileAdmissionFixtureClient } from './ProfileAdmissionFixtureClient';

export const revalidate = false;
export { PROFILE_ADMISSION_FIXTURE_METADATA as metadata } from './guard';

/** Secret-free, E2E-only public-profile admission fixture. */
export default function ProfileAdmissionFixturePage() {
  if (!isProfileAdmissionFixtureEnabled()) notFound();

  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <Suspense fallback={null}>
        <ProfileAdmissionFixtureClient />
      </Suspense>
    </main>
  );
}
