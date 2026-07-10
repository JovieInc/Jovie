import { Skeleton } from '@jovie/ui';
import { Logo } from '@/components/atoms/Logo';

/**
 * Loading frame for `/start` — mirrors the always-docked empty OnboardingShell
 * (logo/intro region + bottom composer dock) so hydration does not FOUC/jump
 * (JOV-3561 Phase 0).
 */
export default function StartLoading() {
  return (
    <div
      className='system-b-start-loading-page'
      aria-busy='true'
      aria-live='polite'
      data-testid='start-loading-skeleton'
    >
      <div className='system-b-start-loading-scroll'>
        <div className='system-b-start-loading-content'>
          <div
            className='system-b-start-loading-mark'
            aria-hidden='true'
            data-testid='chat-empty-state-logo'
          >
            <Logo aria-hidden size='lg' tone='white' variant='icon' />
          </div>
        </div>
      </div>

      <div
        className='system-b-start-loading-composer-dock'
        data-testid='start-loading-composer-dock'
        aria-hidden='true'
      >
        <div className='system-b-start-loading-composer-wrap'>
          <div className='system-b-start-loading-composer'>
            <div className='system-b-start-loading-composer-row'>
              <div className='system-b-start-loading-copy-slot'>
                <Skeleton
                  className='system-b-start-loading-title-skeleton'
                  rounded='full'
                />
              </div>
              <div className='system-b-start-loading-actions'>
                <Skeleton
                  className='system-b-start-loading-action-skeleton'
                  rounded='full'
                />
                <Skeleton
                  className='system-b-start-loading-action-skeleton'
                  rounded='full'
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
