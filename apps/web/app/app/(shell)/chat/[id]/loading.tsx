import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const MESSAGE_SKELETON_KEYS = ['msg-1', 'msg-2', 'msg-3'] as const;

/**
 * Chat conversation loading skeleton.
 * Shows message bubbles and input area matching the JovieChat layout.
 */
export default function ChatConversationLoading() {
  return (
    <div className='flex h-full flex-col' aria-busy='true' aria-live='polite'>
      <div className='flex-1 space-y-4 overflow-hidden px-4 pt-4'>
        {MESSAGE_SKELETON_KEYS.map(key => (
          <div key={key} className='flex gap-3'>
            <LoadingSkeleton height='h-8' width='w-8' rounded='full' />
            <div className='flex-1 space-y-2'>
              <LoadingSkeleton height='h-4' width='w-3/4' rounded='sm' />
              <LoadingSkeleton height='h-4' width='w-1/2' rounded='sm' />
            </div>
          </div>
        ))}
      </div>
      <div className='w-full max-w-2xl mx-auto space-y-3 px-4 pb-4 pt-2'>
        <LoadingSkeleton height='h-12' width='w-full' rounded='lg' />
      </div>
    </div>
  );
}
