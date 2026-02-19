'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowProfilePhotoDownloads } from '@/app/app/(shell)/dashboard/actions/creator-profile';
import {
  DrawerSection,
  DrawerSettingsToggle,
} from '@/components/molecules/drawer';

interface ProfilePhotoSettingsProps {
  /** Current value of the allow profile photo downloads setting */
  readonly allowDownloads: boolean;
}

export function ProfilePhotoSettings({
  allowDownloads: initialAllowDownloads,
}: ProfilePhotoSettingsProps) {
  const [allowDownloads, setAllowDownloads] = useState(initialAllowDownloads);
  const [isPending, setIsPending] = useState(false);

  // Sync local state when the prop changes (e.g. after server refetch)
  useEffect(() => {
    setAllowDownloads(initialAllowDownloads);
  }, [initialAllowDownloads]);

  const handleToggle = useCallback(async (checked: boolean) => {
    setAllowDownloads(checked);
    setIsPending(true);
    try {
      await updateAllowProfilePhotoDownloads(checked);
      toast.success(
        checked
          ? 'Profile photo downloads enabled for visitors'
          : 'Profile photo downloads disabled'
      );
    } catch {
      setAllowDownloads(!checked);
      toast.error('Failed to update setting');
    } finally {
      setIsPending(false);
    }
  }, []);

  return (
    <DrawerSection title='Settings'>
      <DrawerSettingsToggle
        label='Allow photo downloads'
        checked={allowDownloads}
        onCheckedChange={handleToggle}
        disabled={isPending}
        ariaLabel='Allow profile photo downloads on public pages'
      />
    </DrawerSection>
  );
}
