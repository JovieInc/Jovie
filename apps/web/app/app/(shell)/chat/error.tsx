'use client';

import { Button } from '@jovie/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { ErrorProps } from '@/types/common';

export default function ChatError({ error, reset }: ErrorProps) {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full items-center justify-center p-6'>
        <ContentSurfaceCard className='flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center'>
          <AlertCircle className='h-8 w-8 text-tertiary-token' />
          <div className='space-y-1'>
            <p className='text-sm font-medium text-primary-token'>
              Chat couldn&apos;t load
            </p>
            <p className='text-sm text-secondary-token'>
              {error.message || 'Please try again.'}
            </p>
          </div>
          <Button
            onClick={reset}
            variant='secondary'
            size='sm'
            className='gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            Retry
          </Button>
        </ContentSurfaceCard>
      </div>
    </ChatWorkspaceSurface>
  );
}
