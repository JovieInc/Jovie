'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PhoneFrame } from '@/components/molecules/PhoneFrame';
import type { PublicRelease } from '@/features/profile/releases/types';
import { ProfileCompactSurface } from '@/features/profile/templates/ProfileCompactSurface';
import { DirectDspImagesProvider } from '@/lib/images/direct-dsp-images';
import { cn } from '@/lib/utils';
import type { Artist, LegacySocialLink } from '@/types/db';

/**
 * Shared "show off your profile" bento: a gradient hero card holding a phone
 * preview of the live public profile. Reused by the chat profile rail (view
 * mode, with action footer) and onboarding (with the DSP-match strip under
 * the phone).
 *
 * ponytail: one component with optional slots instead of two near-duplicate
 * gradient-card-with-phone blocks. Callers supply the artist/links they already
 * built and toggle the chrome they need.
 */
export interface ProfilePreviewBentoProps {
  /** Domain-specific draft content inside the shared phone and hero chrome. */
  readonly phoneContent?: ReactNode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  /** Real releases to render on the preview (JOV-9758). */
  readonly releases?: readonly PublicRelease[];
  readonly genres?: string[] | null;
  readonly profileHref: string;
  /** Whether the preview visitor already follows the artist. Defaults to false. */
  readonly isSubscribed?: boolean;
  /** Top-left "Live" pill. */
  readonly showLiveBadge?: boolean;
  /** Top-right node (e.g. the More dropdown trigger). */
  readonly topRight?: ReactNode;
  /**
   * Top-left node over the hero (e.g. the onboarding DSP strip), mirroring
   * `topRight`. It sits beside the phone's empty status area, never in the
   * band of the preview's bottom CTA, whatever the rail height. Do not
   * combine with `showLiveBadge`, which uses the same corner.
   */
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
  /** Replaces the default hero gradient when a canonical surface needs it. */
  readonly heroStyle?: CSSProperties;
  /** Extra hero layout classes (sizing, padding). */
  readonly heroClassName?: string;
  readonly phoneFrameClassName?: string;
  /** Load DSP images straight from their CDN (one-off onboarding preview). */
  readonly directDspImages?: boolean;
  /** CSS var overrides forwarded to the phone surface wrapper. */
  readonly coverVars?: CSSProperties;
  readonly dataTestId?: string;
  readonly phonePreviewTestId?: string;
  readonly surfaceTestId?: string;
}

/**
 * Linear's app accent purple radial glow over a dark vertical gradient.
 * Inline style (not an arbitrary Tailwind class) to avoid the arbitrary-value
 * ratchet, matching PhoneFrame's own inline-style approach.
 */
const DEFAULT_HERO_STYLE: CSSProperties = {
  background: 'var(--profile-preview-bento-hero)',
};

const BOTTOM_FADE_STYLE: CSSProperties = {
  background: 'var(--profile-preview-bento-fade)',
};

/** Cover/page-pad CSS vars the compact surface reads (inline to avoid arbitrary classes). */
const DEFAULT_COVER_VARS = {
  '--cover-height': '64%',
  '--page-pad': '18px',
} as CSSProperties;

export function ProfilePreviewBento({
  phoneContent,
  artist,
  socialLinks,
  releases,
  genres,
  profileHref,
  isSubscribed = false,
  showLiveBadge = false,
  topRight,
  overlay,
  caption,
  phoneAlign = 'center',
  showBottomFade = false,
  footer,
  className,
  heroStyle,
  heroClassName,
  phoneFrameClassName,
  directDspImages = false,
  coverVars,
  dataTestId,
  phonePreviewTestId,
  surfaceTestId,
}: ProfilePreviewBentoProps) {
  const phone = (
    <PhoneFrame className={cn('relative z-10', phoneFrameClassName)}>
      <div
        className='h-full w-full'
        style={coverVars ?? DEFAULT_COVER_VARS}
        data-testid={phonePreviewTestId}
      >
        {phoneContent ?? (
          <ProfileCompactSurface
            renderMode='preview'
            presentation='embedded'
            artist={artist}
            socialLinks={socialLinks}
            releases={releases}
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
            isSubscribed={isSubscribed}
            hideBackButton
            hideJovieBranding
            hideMoreMenu
            renderInteractiveOverlays={false}
            renderSemanticHeading={false}
            headerSocialLinksOverride={[]}
            resolveNearbyTour={false}
          />
        )}
      </div>
    </PhoneFrame>
  );

  return (
    <div className={cn('flex flex-col', className)} data-testid={dataTestId}>
      <div
        className={cn(
          'relative flex justify-center overflow-hidden',
          phoneAlign === 'top' ? 'items-start' : 'flex-1 items-center',
          heroClassName
        )}
        style={heroStyle ?? DEFAULT_HERO_STYLE}
      >
        {showLiveBadge && (
          <span className='absolute left-3.5 top-3.5 z-20 inline-flex h-6 items-center gap-1.5 rounded-full border border-on-media/12 bg-ink-on-media/50 px-2.5 backdrop-blur-md'>
            <span className='h-1.5 w-1.5 rounded-full bg-(--color-accent-green)' />
            <span className='text-2xs font-medium text-on-media dark:text-on-media'>
              Live
            </span>
          </span>
        )}
        {topRight && (
          <div className='absolute right-3.5 top-3.5 z-20'>{topRight}</div>
        )}

        {overlay && (
          <div className='absolute left-3.5 top-3.5 z-20'>{overlay}</div>
        )}

        <DirectDspImagesProvider enabled={directDspImages}>
          {phone}
        </DirectDspImagesProvider>

        {showBottomFade && (
          <div
            className='pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20'
            style={BOTTOM_FADE_STYLE}
          />
        )}
      </div>

      {caption && (
        <div className='flex justify-center pt-2.5'>
          <span className='text-2xs font-medium text-tertiary-token'>
            {caption}
          </span>
        </div>
      )}

      {footer}
    </div>
  );
}
