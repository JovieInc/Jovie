'use client';

import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import { APP_ROUTES } from '@/constants/routes';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { usePlanGate } from '@/lib/queries/usePlanGate';
import { cn } from '@/lib/utils';

type SmartLinkGateBannerProps = {
  readonly className?: string;
} & (
  | {
      /** Soft-cap mode: all links work, but prompt to request higher limit */
      readonly mode: 'soft-cap';
      readonly releasedCount: number;
      readonly softCap: number;
    }
  | {
      /** Unreleased mode: encourage upgrading for pre-release pages */
      readonly mode: 'unreleased';
      readonly unreleasedCount: number;
    }
);

interface UnreleasedCopy {
  readonly headline: string;
  readonly body: string;
  readonly cta: string;
}

function getUnreleasedCopy(
  nudgeState: ReturnType<typeof usePlanGate>['nudgeState'],
  unreleasedCount: number
): UnreleasedCopy {
  const releaseLabel = unreleasedCount === 1 ? 'release' : 'releases';

  switch (nudgeState) {
    case 'trial_honeymoon':
    case 'trial_late':
    case 'trial_last_day':
      return {
        headline: `${unreleasedCount} upcoming ${releaseLabel} after your trial`,
        body: 'Lock in Pro to keep pre-release pages live past day 14.',
        cta: 'Lock in Pro',
      };
    case 'recently_lapsed':
      return {
        headline: `${unreleasedCount} upcoming ${releaseLabel}`,
        body: 'Reclaim Pro to bring pre-release pages and countdowns back.',
        cta: 'Reclaim Pro',
      };
    case 'stale_lapsed':
      return {
        headline: `${unreleasedCount} upcoming ${releaseLabel}`,
        body: 'Get Pro to enable pre-release pages and countdowns.',
        cta: 'Get Pro',
      };
    default:
      return {
        headline: `You have ${unreleasedCount} upcoming ${releaseLabel}`,
        body: 'Enable pre-release pages with countdowns and notify-me.',
        cta: 'Upgrade to Pro',
      };
  }
}

/**
 * Contextual banner for free-tier users:
 * - soft-cap: shown when released count exceeds the soft cap (100). Links still
 *   work, but the user is prompted to request a higher limit via email.
 * - unreleased: shown when the user has upcoming releases but can't access
 *   pre-release pages. Copy adapts to nudgeState — trial users see "after your
 *   trial," lapsed users see reclaim language, never-trialed users see the
 *   discovery copy.
 *
 * Pro and Max users never reach this banner — the parent component checks
 * `!isPro` before rendering. The nudgeState lookup here is for copy only;
 * pro_paid and max_paid would correctly fall through to the discovery copy
 * since they shouldn't be visible regardless.
 */
export function SmartLinkGateBanner(props: SmartLinkGateBannerProps) {
  const { className, mode } = props;
  const { nudgeState } = usePlanGate();

  return (
    <DrawerSurfaceCard
      as='aside'
      variant='card'
      className={cn(
        LINEAR_SURFACE.bannerCard,
        'flex items-start gap-3 px-4 py-3',
        className
      )}
      aria-label={
        mode === 'soft-cap'
          ? 'Smart link limit notice'
          : 'Smart link upgrade prompt'
      }
    >
      <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/8'>
        <Icon
          name='Sparkles'
          className='h-4 w-4 text-(--linear-accent)'
          aria-hidden='true'
        />
      </div>
      <div className='min-w-0 flex-1'>
        {mode === 'soft-cap' ? (
          <>
            <p className='text-app font-caption text-primary-token'>
              You have {props.releasedCount} smart links
            </p>
            <p className='mt-0.5 text-2xs leading-[1.35] text-secondary-token'>
              Need more than {props.softCap}? Request a higher limit.
            </p>
            <DrawerButton
              asChild
              tone='ghost'
              size='sm'
              className='mt-1.5 h-7 w-fit rounded-lg px-2 text-2xs'
            >
              <a href='mailto:support@jov.ie?subject=Smart%20link%20limit%20increase%20request'>
                Email support
              </a>
            </DrawerButton>
          </>
        ) : (
          (() => {
            const copy = getUnreleasedCopy(nudgeState, props.unreleasedCount);
            return (
              <>
                <p className='text-app font-caption text-primary-token'>
                  {copy.headline}
                </p>
                <p className='mt-0.5 text-2xs leading-[1.35] text-secondary-token'>
                  {copy.body}
                </p>
                <DrawerButton
                  asChild
                  tone='ghost'
                  size='sm'
                  className='mt-1.5 h-7 w-fit rounded-lg px-2 text-2xs'
                >
                  <Link href={APP_ROUTES.LAUNCH_PRICING}>{copy.cta}</Link>
                </DrawerButton>
              </>
            );
          })()
        )}
      </div>
    </DrawerSurfaceCard>
  );
}
