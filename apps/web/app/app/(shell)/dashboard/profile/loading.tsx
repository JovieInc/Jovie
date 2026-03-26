import { ChatWorkspaceSurface } from '@/components/jovie/ChatWorkspaceSurface';
import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function ProfileLoading() {
  return (
    <ChatWorkspaceSurface>
      <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
        <div className='flex-1'>
          <ChatMessageSkeleton />
        </div>
        <div className='border-t border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-4 pb-4 pt-4 sm:px-5 sm:pb-6'>
          <div className='mx-auto w-full max-w-2xl space-y-2'>
            <LoadingSkeleton height='h-10' width='w-full' rounded='lg' />
          </div>
        </div>
      </div>
    </ChatWorkspaceSurface>
  );
}
