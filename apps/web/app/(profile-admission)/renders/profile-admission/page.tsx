import { notFound } from 'next/navigation';
import {
  isRenderFixtureEnabled,
  RENDER_FIXTURE_METADATA,
} from '@/lib/render-fixture-policy';
import { ProfileAdmissionFixtureClient } from '../../../(marketing)/renders/profile-admission/ProfileAdmissionFixtureClient';

export const revalidate = false;
export const metadata = RENDER_FIXTURE_METADATA;

/** Secret-free, E2E-only public-profile admission fixture. */
export default async function ProfileAdmissionFixturePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (!isRenderFixtureEnabled()) notFound();
  const params = await searchParams;

  return (
    <main className='flex h-dvh justify-center overflow-hidden bg-black dark:bg-black'>
      <ProfileAdmissionFixtureClient params={params} />
    </main>
  );
}
