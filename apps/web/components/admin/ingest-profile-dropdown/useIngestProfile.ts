'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useIngestProfileMutation } from '@/lib/queries/useIngestProfileMutation';
import { detectPlatform } from '@/lib/utils/platform-detection';
import type { PlatformInfo } from '@/lib/utils/platform-detection/types';
import type { UseIngestProfileReturn } from './types';

interface UseIngestProfileOptions {
  onIngestPending?: (profile: { id: string; username: string }) => void;
}

export function useIngestProfile({
  onIngestPending,
}: UseIngestProfileOptions): UseIngestProfileReturn {
  const router = useRouter();
  const notifications = useNotifications();

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // TanStack Query mutation for cache invalidation
  const ingestProfileMutation = useIngestProfileMutation();

  // Detect platform from URL in real-time
  const detectedPlatform: PlatformInfo | null = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Only detect if it looks like a URL
    if (
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('https://') &&
      !trimmed.includes('.')
    ) {
      return null;
    }

    try {
      const detected = detectPlatform(trimmed);
      // Don't show "website" as detected - that's the fallback
      if (detected.platform.id === 'website') return null;
      return detected.platform;
    } catch {
      return null;
    }
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      notifications.error('Please enter a URL');
      return;
    }

    try {
      const result = await ingestProfileMutation.mutateAsync({
        url: trimmedUrl,
      });

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
      setUrl('');

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
      setIsSuccess(false);
    }
  };

  return {
    open,
    setOpen,
    url,
    setUrl,
    isLoading: ingestProfileMutation.isPending,
    isSuccess,
    detectedPlatform,
    handleSubmit,
  };
}
