'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AuthRoutePrefetchProps {
  readonly href: string;
}

export function AuthRoutePrefetch({ href }: AuthRoutePrefetchProps) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return null;
}
