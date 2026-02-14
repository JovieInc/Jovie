'use client';

/**
 * ReleaseSettings Component
 *
 * Release-level settings section in the sidebar,
 * including the "Allow Artwork Downloads" toggle.
 */

import { Switch } from '@jovie/ui';
import { useCallback, useId, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowArtworkDownloads } from '@/app/app/(shell)/dashboard/releases/actions';
import {
  DrawerPropertyRow,
  DrawerSection,
} from '@/components/molecules/drawer';

interface ReleaseSettingsProps {
  /** Current value of the allow artwork downloads setting */
  readonly allowDownloads: boolean;
}

export function ReleaseSettings({
  allowDownloads: initialAllowDownloads,
}: ReleaseSettingsProps) {
  const [allowDownloads, setAllowDownloads] = useState(initialAllowDownloads);
  const [isPending, setIsPending] = useState(false);
  const switchId = useId();

  const handleToggle = useCallback(async (checked: boolean) => {
    setAllowDownloads(checked);
    setIsPending(true);
    try {
      await updateAllowArtworkDownloads(checked);
      toast.success(
        checked
          ? 'Artwork downloads enabled for visitors'
          : 'Artwork downloads disabled'
      );
    } catch {
      // Revert on failure
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
          label='Allow album art downloads'
          value={
            <Switch
              id={switchId}
              checked={allowDownloads}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label='Allow artwork downloads on public pages'
            />
          }
        />
        <p className='text-[10px] text-tertiary-token leading-relaxed'>
          When enabled, visitors can right-click your album artwork on public
          pages to download it in multiple sizes.
        </p>
      </div>
    </DrawerSection>
  );
}
