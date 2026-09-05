import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SignInPageClient } from '@/app/(auth)/signin/SignInPageClient';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';

export const dynamic = 'force-dynamic';
export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  if (!params.redirect_url) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (typeof value === 'string') query.set(key, value);
    query.set('redirect_url', '/hud');
    redirect(`/signin?${query}`);
  }
  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInPageClient />
    </Suspense>
  );
}
