import { notFound } from 'next/navigation';
import { isProfileAdmissionFixtureEnabled } from '../../../(marketing)/renders/profile-admission/guard';
import { ProfileAdmissionFixtureClient } from '../../../(marketing)/renders/profile-admission/ProfileAdmissionFixtureClient';

export const revalidate = false;
export { PROFILE_ADMISSION_FIXTURE_METADATA as metadata } from '../../../(marketing)/renders/profile-admission/guard';

/** Secret-free, E2E-only public-profile admission fixture. */
export default async function ProfileAdmissionFixturePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!isProfileAdmissionFixtureEnabled()) notFound();
  const params = await searchParams;

  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <ProfileAdmissionFixtureClient params={params} />
    </main>
  );
}
