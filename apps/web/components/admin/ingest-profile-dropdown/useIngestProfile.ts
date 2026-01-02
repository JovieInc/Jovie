'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { PLATFORM_OPTIONS, PLATFORM_PREFIX } from './constants';
import type { IngestPlatform, UseIngestProfileReturn } from './types';

interface UseIngestProfileOptions {
  onIngestPending?: (profile: { id: string; username: string }) => void;
}

export function useIngestProfile({
  onIngestPending,
}: UseIngestProfileOptions): UseIngestProfileReturn {
  const router = useRouter();
  const notifications = useNotifications();

  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [urlOverride, setUrlOverride] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] =
    useState<IngestPlatform>('linktree');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const currentPlatform = PLATFORM_OPTIONS.find(p => p.id === selectedPlatform);

  const effectiveUrl = useMemo(() => {
    if (urlOverride) return urlOverride.trim();
    const prefix = PLATFORM_PREFIX[selectedPlatform];
    const trimmed = username.trim().replace(/^@/, '');
    return trimmed ? `${prefix}${trimmed}` : '';
  }, [selectedPlatform, urlOverride, username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveUrl) {
      notifications.error('Please enter a handle');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/creator-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: effectiveUrl }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: { id: string; username: string };
        links?: number;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Failed to ingest profile');
      }

      const profileId = result.profile?.id;
      const profileUsername = result.profile?.username;
      const successMessage = profileUsername
        ? `Created creator profile @${profileUsername}`
        : 'Created new creator profile';

      notifications.success(successMessage, {
        action: profileUsername
          ? {
              label: 'View profile',
              onClick: () => router.push(`/${profileUsername}`),
            }
          : undefined,
      });

      if (profileId && profileUsername) {
        onIngestPending?.({ id: profileId, username: profileUsername });
      }

      setIsSuccess(true);

      setUsername('');
      setUrlOverride(null);

      router.refresh();

      setTimeout(() => {
        setOpen(false);
        setIsSuccess(false);
      }, 900);
    } catch (error) {
      console.error('Ingestion error', error);
      notifications.error(
        error instanceof Error ? error.message : 'Failed to ingest profile'
      );
    } finally {
      setIsLoading(false);
      setIsSuccess(false);
    }
  };

  return {
    open,
    setOpen,
    username,
    setUsername,
    urlOverride,
    setUrlOverride,
    selectedPlatform,
    setSelectedPlatform,
    isLoading,
    isSuccess,
    currentPlatform,
    effectiveUrl,
    handleSubmit,
  };
}
