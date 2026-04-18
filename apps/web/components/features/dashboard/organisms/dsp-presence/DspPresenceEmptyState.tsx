'use client';

import { Button } from '@jovie/ui';
import { Radio } from 'lucide-react';
import { EmptyState } from '@/components/organisms/EmptyState';

interface DspPresenceEmptyStateProps {
  readonly onAddPlatform: () => void;
}

export function DspPresenceEmptyState({
  onAddPlatform,
}: DspPresenceEmptyStateProps) {
  return (
    <div
      className='flex h-full items-center justify-center p-8'
      data-testid='presence-empty-state'
    >
      <div className='flex flex-col items-center'>
        <EmptyState
          icon={<Radio className='h-12 w-12' />}
          heading='No DSP profiles found'
          description='We automatically find your profiles on streaming platforms. You can also add them manually.'
        />
        <Button size='sm' onClick={onAddPlatform}>
          Add Platform
        </Button>
      </div>
    </div>
  );
}
