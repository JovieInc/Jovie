import { ProfileAdmissionFixtureClient } from './ProfileAdmissionFixtureClient';

export const revalidate = false;

/**
 * Secret-free, profile-classified browser fixture for required CI admission.
 * The first path segment intentionally passes the canonical public-profile
 * classifier so consent-card versus profile-dock geometry is exercised.
 */
export default function ProfileAdmissionFixturePage() {
  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <ProfileAdmissionFixtureClient />
    </main>
  );
}
