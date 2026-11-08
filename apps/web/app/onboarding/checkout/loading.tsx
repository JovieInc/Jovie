import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { OnboardingCheckoutFrame } from './OnboardingCheckoutFrame';

const HIGHLIGHT_ROWS = ['emails', 'analytics', 'badge'] as const;

/** One placeholder block, sized to the element it stands in for. */
function Bar({ className }: Readonly<{ className: string }>) {
  return <span aria-hidden='true' className={`skeleton block ${className}`} />;
}

/**
 * Loading state for the onboarding checkout. It draws the checkout's own
 * frame and mirrors its blocks (header, profile card, plan highlights, price,
 * button), so the page swaps in place instead of jumping from another layout.
 */
export default function OnboardingCheckoutLoading() {
  return (
    <OnboardingCheckoutFrame>
      <output
        aria-busy='true'
        aria-label='Loading Your Upgrade'
        className='contents'
        data-testid='onboarding-checkout-loading'
      >
        <div className={FORM_LAYOUT.headerSection}>
          <Bar className='h-7 w-56 rounded-sm' />
          <Bar className='mt-3 h-4 w-80 max-w-full rounded-sm' />
          <Bar className='mt-2 h-4 w-64 max-w-full rounded-sm' />
        </div>

        <ContentSurfaceCard className='mb-6'>
          <div className='flex flex-col items-center gap-4 p-5'>
            {/* Avatar size lg is 64px. */}
            <Bar className='h-16 w-16 rounded-full' />
            <div className='flex flex-col items-center gap-1.5'>
              <Bar className='h-5 w-36 rounded-sm' />
              <Bar className='h-3 w-20 rounded-sm' />
            </div>
            <div className='w-full'>
              <Bar className='h-11 w-full rounded-xl' />
              <div className='mt-2 flex justify-center'>
                <Bar className='h-5 w-24 rounded-full' />
              </div>
            </div>
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='mb-6'>
          <div
            className='space-y-2.5 p-4'
            data-testid='checkout-loading-highlights'
          >
            {HIGHLIGHT_ROWS.map(row => (
              <div key={row} className='flex items-start gap-3'>
                <Bar className='h-8 w-8 shrink-0 rounded-full' />
                <div className='flex flex-1 flex-col gap-1.5 pt-0.5'>
                  <Bar className='h-4 w-32 rounded-sm' />
                  <Bar className='h-3 w-52 max-w-full rounded-sm' />
                </div>
              </div>
            ))}
          </div>
        </ContentSurfaceCard>

        <div className='mb-6 flex justify-center'>
          <Bar className='h-9 w-28 rounded-sm' />
        </div>

        <Bar className='h-7 w-full rounded-full' />
        <div className='mt-4 flex justify-center'>
          <Bar className='h-5 w-36 rounded-sm' />
        </div>
      </output>
    </OnboardingCheckoutFrame>
  );
}
