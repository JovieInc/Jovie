import { LoadingSkeleton } from '@jovie/ui';
import { cn } from '@/lib/utils';
import { INLINE_FLOW } from './inline-flow-layout';
import {
  CAPTURE_CONSENT_COPY,
  ScreenShell,
} from './ProfileMobileNotificationsFlow';

/**
 * Loading state for the inline flow. It lays out the email step with the
 * same classes as the live flow, so swapping it for the form moves nothing
 * below it (the old short skeleton pushed the profile footer down on phones).
 */
export function InlineNotificationsFlowSkeleton() {
  return (
    <output
      className={INLINE_FLOW.root}
      aria-busy='true'
      data-testid='profile-mobile-notifications-flow-skeleton'
    >
      <span className='sr-only'>Loading subscription form</span>
      <div
        className={cn(INLINE_FLOW.body, INLINE_FLOW.inset)}
        aria-hidden='true'
      >
        <div className={INLINE_FLOW.topBar}>
          <span className='h-10 w-10' />
          <span className='h-10 w-10' />
        </div>
        <div className={INLINE_FLOW.step}>
          <ScreenShell
            compact
            title={' '}
            body={' '}
            footer={
              <div className='space-y-2'>
                <p className='invisible text-xs leading-4'>
                  {CAPTURE_CONSENT_COPY.email} Privacy
                </p>
                <div className='h-11' />
              </div>
            }
          >
            <div className='space-y-3'>
              <div className='rounded-(--profile-action-radius) border border-subtle bg-surface-1 p-1'>
                <div className='min-h-14' />
              </div>
              <LoadingSkeleton
                height='h-11'
                width='w-full'
                rounded='full'
                announce={false}
              />
            </div>
          </ScreenShell>
        </div>
      </div>
    </output>
  );
}
