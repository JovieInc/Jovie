'use client';

import type { ReactNode } from 'react';
import { PhoneFrame } from '@/components/molecules/PhoneFrame';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';

/**
 * Shared "show off your profile" bento: a gradient hero card holding a phone
 * preview of the live public profile. Reused by the chat profile rail (view
 * mode, with action footer) and onboarding (with a DSP-match overlay).
 *
 * ponytail: one component with optional slots instead of two near-duplicate
 * gradient-card-with-phone blocks. Callers supply the artist/links they already
 * built and toggle the chrome they need.
 */
export interface ProfilePreviewBentoProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly genres?: string[] | null;
  readonly profileHref: string;
  /** Top-left "Live" pill. */
  readonly showLiveBadge?: boolean;
  /** Top-right node (e.g. the More dropdown trigger). */
  readonly topRight?: ReactNode;
  /** Absolutely-positioned bottom overlay inside the hero (e.g. DSP strip). */
  readonly overlay?: ReactNode;
  /** Caption under the phone (e.g. "Your live profile"). */
  readonly caption?: ReactNode;
  /**
   * Vertical alignment of the phone inside the hero. 'top' shows the profile
   * identity and fades the bottom (use with a bounded hero height); 'center'
   * shows the whole phone (onboarding's tall rail). Defaults to 'center'.
   */
  readonly phoneAlign?: 'center' | 'top';
  /** Fade the bottom of the hero into the card (pairs with phoneAlign='top'). */
  readonly showBottomFade?: boolean;
  /** Content rendered below the gradient hero (URL + stats + edit button). */
  readonly footer?: ReactNode;
  readonly className?: string;
  /** Replaces the default hero gradient (e.g. onboarding's blue). */
  readonly heroGradientClassName?: string;
  /** Extra hero layout classes (sizing, padding) applied after the gradient. */
  readonly heroClassName?: string;
  readonly phoneFrameClassName?: string;
  /** CSS var overrides forwarded to the phone surface wrapper. */
  readonly coverVarsClassName?: string;
  readonly dataTestId?: string;
  readonly phonePreviewTestId?: string;
  readonly surfaceTestId?: string;
}

/** Linear's app accent purple radial glow over a dark vertical gradient. */
const DEFAULT_HERO_GRADIENT =
  'bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(123,108,255,0.42)_0%,rgba(70,58,170,0.14)_38%,rgba(12,12,20,0)_66%),linear-gradient(180deg,#14131f_0%,#0c0c12_100%)]';

export function ProfilePreviewBento({
  artist,
  socialLinks,
  genres,
  profileHref,
  showLiveBadge = false,
  topRight,
  overlay,
  caption,
  phoneAlign = 'center',
  showBottomFade = false,
  footer,
  className,
  heroGradientClassName = DEFAULT_HERO_GRADIENT,
  heroClassName,
  phoneFrameClassName,
  coverVarsClassName = '[--cover-height:45%] [--page-pad:18px]',
  dataTestId,
  phonePreviewTestId,
  surfaceTestId,
}: ProfilePreviewBentoProps) {
  return (
    <div className={cn('flex flex-col', className)} data-testid={dataTestId}>
      <div
        className={cn(
          'relative flex justify-center overflow-hidden',
          phoneAlign === 'top' ? 'items-start' : 'flex-1 items-center',
          heroGradientClassName,
          heroClassName
        )}
      >
        {showLiveBadge && (
          <span className='absolute left-3.5 top-3.5 z-20 inline-flex h-6 items-center gap-1.5 rounded-full border border-white/12 bg-black/50 px-2.5 backdrop-blur-md'>
            <span className='h-1.5 w-1.5 rounded-full bg-(--color-accent-green) shadow-[0_0_8px_var(--color-accent-green)]' />
            <span className='text-3xs font-semibold uppercase tracking-[0.05em] text-white dark:text-white'>
              Live
            </span>
          </span>
        )}
        {topRight && (
          <div className='absolute right-3.5 top-3.5 z-20'>{topRight}</div>
        )}

        <PhoneFrame className={cn('relative z-10', phoneFrameClassName)}>
          <div
            className={cn('h-full w-full', coverVarsClassName)}
            data-testid={phonePreviewTestId}
          >
            <ProfileCompactSurface
              renderMode='preview'
              presentation='embedded'
              artist={artist}
              socialLinks={socialLinks}
              contacts={[]}
              showPayButton={false}
              genres={genres}
              drawerOpen={false}
              drawerView='menu'
              activeMode='profile'
              onDrawerOpenChange={() => {}}
              onDrawerViewChange={() => {}}
              onBack={() => {}}
              onOpenMenu={() => {}}
              onPlayClick={() => {}}
              onShare={() => {}}
              onModeSelect={() => {}}
              profileHref={profileHref}
              dataTestId={surfaceTestId}
              isSubscribed
              hideBackButton
              hideJovieBranding
              hideMoreMenu
              renderInteractiveOverlays={false}
              renderSemanticHeading={false}
              headerSocialLinksOverride={[]}
              resolveNearbyTour={false}
            />
          </div>
        </PhoneFrame>

        {showBottomFade && (
          <div className='pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-b from-transparent to-[#0c0c12]' />
        )}
        {caption && (
          <span className='pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-2xs font-medium text-white/60 dark:text-white/60'>
            {caption}
          </span>
        )}
        {overlay}
      </div>

      {footer}
    </div>
  );
}
