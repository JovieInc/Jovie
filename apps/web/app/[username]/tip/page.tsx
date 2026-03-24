'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileRedirectSurface } from '@/components/features/profile/ProfileRedirectSurface';
import { getProfileModeHref } from '@/features/profile/registry';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default function TipPage({ params }: Readonly<Props>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    params.then(({ username }) => {
      if (cancelled) {
        return;
      }

      const source = searchParams?.get('source');
      const sourceSuffix = source ? 'source=' + encodeURIComponent(source) : '';
      router.replace(getProfileModeHref(username, 'tip', sourceSuffix));
    });

    return () => {
      cancelled = true;
    };
  }, [params, router, searchParams]);

  return (
    <ProfileRedirectSurface
      title='Opening tip flow'
      description='Loading the tipping view for this profile.'
    />
  );
}
