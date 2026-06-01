import { Skeleton } from '@jovie/ui';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';

export default function StartLoading() {
  return (
    <div
      className='relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-(--linear-app-content-surface)'
      aria-busy='true'
      aria-live='polite'
      data-testid='start-loading-skeleton'
    >
      <div className='relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8'>
        <div className='mx-auto flex min-h-full w-full max-w-[52rem] flex-col items-center justify-center px-1 py-8'>
          <div
            className='pointer-events-none absolute left-1/2 top-1/2 h-[min(46vw,28rem)] w-[min(46vw,28rem)] -translate-x-1/2 -translate-y-[60%] opacity-85 drop-shadow-[0_0_34px_rgba(68,188,255,0.18)] max-sm:h-[min(72vw,18rem)] max-sm:w-[min(72vw,18rem)]'
            style={{
              maskImage:
                'radial-gradient(ellipse at center, black 54%, rgba(0,0,0,0.72) 68%, transparent 88%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at center, black 54%, rgba(0,0,0,0.72) 68%, transparent 88%)',
            }}
            data-testid='chat-empty-state-logo'
          >
            <JovieMarkElectric className='h-full w-full' />
          </div>

          <div className='relative z-10 mx-auto w-full max-w-[45rem]'>
            <div
              className='overflow-hidden rounded-[36px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_84%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_88%,black_12%)] shadow-[0_18px_68px_-34px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.08)]'
              aria-hidden='true'
            >
              <div className='flex min-h-[56px] items-center gap-1.5 px-3 py-1.5 sm:min-h-[56px] sm:px-3'>
                <div className='min-w-0 flex-1 px-3'>
                  <Skeleton className='h-5 w-[58%]' rounded='full' />
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Skeleton className='h-9 w-9' rounded='full' />
                  <Skeleton className='h-9 w-9' rounded='full' />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
