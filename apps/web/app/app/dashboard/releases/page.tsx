import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ReleaseProviderMatrix } from '@/components/dashboard/organisms/ReleaseProviderMatrix';
import { loadReleaseMatrix } from './actions';
import { primaryProviderKeys, providerConfig } from './config';

export default async function ReleasesPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const releases = await loadReleaseMatrix();

  return (
    <ReleaseProviderMatrix
      releases={releases}
      providerConfig={providerConfig}
      primaryProviders={primaryProviderKeys}
    />
  );
}
