'use client';

import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import type { ErrorProps } from '@/types/common';

export default function ChatError({ error, reset }: ErrorProps) {
  // Log the actual error for debugging, but never show raw message to users
  console.error('[ChatError]', error);

  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full items-center justify-center p-6'>
        <PageErrorState
          title="Conversation couldn't load"
          message='Something went wrong. Please try again.'
          error={error}
          actionLabel='Retry'
          onRetry={reset}
          extraContext={{ Context: 'Chat' }}
        />
      </div>
    </ChatWorkspaceSurface>
  );
}
