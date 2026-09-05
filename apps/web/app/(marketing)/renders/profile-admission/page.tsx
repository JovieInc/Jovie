import { notFound } from 'next/navigation';
import { isProfileAdmissionFixtureEnabled } from './guard';
import { ProfileAdmissionFixtureClient } from './ProfileAdmissionFixtureClient';

export const revalidate = false;
export { PROFILE_ADMISSION_FIXTURE_METADATA as metadata } from './guard';

/** Secret-free, E2E-only public-profile admission fixture. */
export default async function ProfileAdmissionFixturePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!isProfileAdmissionFixtureEnabled()) notFound();

  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <ProfileAdmissionFixtureClient params={await searchParams} />
    </main>
  );
}
