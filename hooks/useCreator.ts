'use client';

import { useEffect, useState } from 'react';
import { fetchCreatorProfile } from '@/lib/actions/creator';

type CreatorWithSocialLinks = Awaited<ReturnType<typeof fetchCreatorProfile>>;

export function useCreator(username: string) {
  const [creator, setCreator] = useState<CreatorWithSocialLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadCreator() {
      try {
        setLoading(true);
        const data = await fetchCreatorProfile(username);
        setCreator(data);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to load creator')
        );
      } finally {
        setLoading(false);
      }
    }

    if (username) {
      loadCreator();
    }
  }, [username]);

  return { creator, loading, error };
}
