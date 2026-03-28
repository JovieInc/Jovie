'use client';

import { Radio } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/organisms/EmptyState';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';
import { AddPlatformDialog } from './AddPlatformDialog';

interface DspPresenceEmptyStateProps {
  readonly existingProviderIds: DspProviderId[];
}

export function DspPresenceEmptyState({
  existingProviderIds,
}: DspPresenceEmptyStateProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className='flex h-full items-center justify-center p-8'>
      <EmptyState
        icon={<Radio className='h-12 w-12' />}
        heading='No DSP profiles found'
        description='We automatically find your profiles on streaming platforms. You can also add them manually.'
        action={{
          label: 'Add Platform',
          onClick: () => setDialogOpen(true),
        }}
      />
      <AddPlatformDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        existingProviderIds={existingProviderIds}
      />
    </div>
  );
}
