import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SmartLinkPageFrame } from './SmartLinkPagePrimitives';

const PROVIDER_SKELETON_KEYS = Array.from(
  { length: 5 },
  (_, i) => 'provider-skeleton-' + (i + 1)
);

export function SmartLinkLoadingState() {
  return (
    <SmartLinkPageFrame glowClassName='h-[18rem] w-[18rem]'>
      <div className='flex flex-1 flex-col items-center justify-center gap-8 pb-4'>
        <LoadingSkeleton height='h-64' width='w-64' rounded='lg' />

        <div className='w-full space-y-3 text-center'>
          <LoadingSkeleton
            className='mx-auto'
            height='h-8'
            width='w-48'
            rounded='md'
          />
          <LoadingSkeleton
            className='mx-auto'
            height='h-5'
            width='w-32'
            rounded='md'
          />
        </div>

        <div className='w-full space-y-3'>
          {PROVIDER_SKELETON_KEYS.map(key => (
            <LoadingSkeleton
              key={key}
              height='h-12'
              width='w-full'
              rounded='lg'
            />
          ))}
        </div>
      </div>
    </SmartLinkPageFrame>
  );
}
