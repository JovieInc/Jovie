'use client';

/**
 * ProfilePhotoSettings Component
 *
 * Toggle for enabling/disabling profile photo downloads on public pages.
 * Mirrors the ReleaseSettings pattern used for album art downloads.
 */

import { Switch } from '@jovie/ui';
import { useCallback, useId, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowProfilePhotoDownloads } from '@/app/app/(shell)/dashboard/actions/creator-profile';
import {
  DrawerPropertyRow,
  DrawerSection,
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
  const switchId = useId();

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
      <div className='space-y-2.5'>
        <DrawerPropertyRow
          label='Allow photo downloads'
          value={
            <Switch
              id={switchId}
              checked={allowDownloads}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label='Allow profile photo downloads on public pages'
            />
          }
        />
        <p className='text-[10px] text-tertiary-token leading-relaxed'>
          When enabled, visitors can right-click your profile photo on public
          pages to download it in multiple sizes.
        </p>
      </div>
    </DrawerSection>
  );
}
