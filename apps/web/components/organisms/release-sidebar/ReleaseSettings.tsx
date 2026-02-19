'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { updateAllowArtworkDownloads } from '@/app/app/(shell)/dashboard/releases/actions';
import {
  DrawerSection,
  DrawerSettingsToggle,
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
      <DrawerSettingsToggle
        label='Allow album art downloads'
        checked={allowDownloads}
        onCheckedChange={handleToggle}
        disabled={isPending}
        ariaLabel='Allow artwork downloads on public pages'
      />
    </DrawerSection>
  );
}
