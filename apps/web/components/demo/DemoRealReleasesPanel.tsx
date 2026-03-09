'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { ReleaseTable } from '@/components/dashboard/organisms/release-provider-matrix/ReleaseTable';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  DEMO_PROVIDER_CONFIG,
  DEMO_RELEASE_VIEW_MODELS,
} from './mock-release-data';

/**
 * Demo panel using the real production ReleaseTable component
 * with static mock ReleaseViewModel data.
 */
export function DemoRealReleasesPanel() {
  const handleCopy = useCallback(
    async (path: string, label: string, _testId: string) => {
      try {
        await navigator.clipboard.writeText(`https://jov.ie${path}`);
        toast.success(`${label} copied (demo)`);
      } catch {
        // clipboard may not be available
      }
      return path;
    },
    []
  );

  const handleEdit = useCallback((release: ReleaseViewModel) => {
    toast.info(`Opening ${release.title} (demo)`);
  }, []);

  return (
    <div className='flex h-full min-h-0 min-w-0 flex-col'>
      <ReleaseTable
        releases={DEMO_RELEASE_VIEW_MODELS}
        providerConfig={DEMO_PROVIDER_CONFIG}
        artistName='Tim White'
        onCopy={handleCopy}
        onEdit={handleEdit}
      />
    </div>
  );
}
