import { Button } from '@jovie/ui';
import { Bell, Check } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { HOSTNAME } from '@/constants/domains';
import { cn } from '@/lib/utils';
import {
  publicLinkAriaLabel,
  publicPlatformDisplayName,
  sanitizePublicHref,
} from '@/lib/utils/public-url';
import type { LegacySocialLink } from '@/types/db';

/**
 * Jovie profile identity header (Pen y1PaMa / VpRf5 / MvmY2 / p0Jia): an
 * 80px portrait with a small verified check glyph, the name, the jov.ie
 * handle, then one row with the flat frosted primary action and the social
 * icons. Every control keeps a 44px hit area; the pill face is 28px.
 *
 * Primary action (Tim, 2026-09-26): "Get Updates" opens the fan subscribe
 * flow whenever the profile accepts fans. There is no secondary Listen
 * action: songs carry their own Listen buttons. Profiles that cannot take
 * fans keep Listen as the primary pill when there is somewhere to listen.
 */
export interface ProfileIdentityHeaderProps {
  readonly name: string;
  readonly handle: string;
  readonly imageUrl: string | null;
  readonly isVerified?: boolean;
  readonly profileHref: string;
  readonly listenHref: string;
  readonly isListenActive?: boolean;
  readonly onListenClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Opens the fan subscribe flow. When set, Get Updates is the primary. */
  readonly onGetUpdatesClick?: () => void;
  /** The viewer already gets updates; the primary reads as a manage state. */
  readonly isSubscribed?: boolean;
  /** Listen fallback only: false when there is nowhere to listen. */
  readonly hasListenDestination?: boolean;
  readonly socialLinks?: readonly LegacySocialLink[];
  readonly onSocialClick?: (link: LegacySocialLink) => void;
  /** `p` for previews and embeds that must not add a second page h1. */
  readonly headingAs?: 'h1' | 'p';
  readonly headingTestId?: string;
  /** Priority-load the portrait when it is the page's first image. */
  readonly imagePriority?: boolean;
  readonly className?: string;
}

const PILL_FACE_CLASS_NAME =
  'profile-glass-pill profile-glass-pill--flat flex h-7 w-full items-center justify-center gap-1.5 text-mid font-medium leading-none group-focus-visible:ring-2 group-focus-visible:ring-focus';

/**
 * 44px hit slot for the 28px pill face. The canonical Button is a transparent
 * overlay (layout-only classes — shadcn/no-restyle forbids visual overrides)
 * so the row keeps raw <button> usage at zero; the pill face owns the look.
 */
const PILL_HIT_SLOT_CLASS_NAME =
  'relative flex h-11 min-w-0 flex-1 touch-manipulation items-center';
const PILL_HIT_OVERLAY_CLASS_NAME = 'absolute inset-0';

const SOCIAL_ICON_CLASS_NAME =
  'inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-tertiary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function ProfileIdentityHeader({
  name,
  handle,
  imageUrl,
  isVerified = false,
  profileHref,
  listenHref,
  isListenActive = false,
  onListenClick,
  onGetUpdatesClick,
  isSubscribed = false,
  hasListenDestination = true,
  socialLinks = [],
  onSocialClick,
  headingAs: Heading = 'h1',
  headingTestId,
  imagePriority = false,
  className,
}: Readonly<ProfileIdentityHeaderProps>) {
  const renderedSocialLinks = socialLinks.flatMap(link => {
    if (!link.platform) return [];
    const href = sanitizePublicHref(link.url);
    return href ? [{ link, href, platform: link.platform }] : [];
  });

  return (
    <div
      className={cn('flex flex-col items-center text-center', className)}
      data-testid='profile-identity-header'
    >
      <div className='relative h-20 w-20 shrink-0'>
        <div
          className='relative h-full w-full overflow-hidden rounded-full bg-surface-2'
          data-testid='profile-identity-portrait'
        >
          <ImageWithFallback
            src={imageUrl}
            alt=''
            fill
            priority={imagePriority}
            sizes='80px'
            className='object-cover'
            fallbackVariant='avatar'
            fallbackClassName='bg-surface-2'
          />
        </div>
        {isVerified ? (
          <span
            className='absolute bottom-0 right-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-(--profile-stage-bg) text-primary-token ring-2 ring-(--profile-stage-bg)'
            role='img'
            aria-label='Verified Jovie Profile'
            title='Verified Jovie Profile'
            data-testid='profile-identity-verified'
          >
            <Check className='h-3 w-3' strokeWidth={2.5} aria-hidden='true' />
          </span>
        ) : null}
      </div>

      <Heading
        className='mt-1.5 min-w-0 max-w-full'
        data-testid={headingTestId}
      >
        <Link
          href={profileHref}
          prefetch={false}
          className='flex min-h-11 min-w-0 items-center justify-center rounded-md text-2xl font-normal leading-8 tracking-tight text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
          data-testid='profile-identity-link'
        >
          <span className='min-w-0 truncate'>{name}</span>
        </Link>
      </Heading>
      <p
        className='max-w-full truncate text-sm leading-5 text-tertiary-token'
        data-testid='profile-identity-handle'
      >
        {`${HOSTNAME}/${handle}`}
      </p>

      <div
        className='mt-2 flex min-h-11 w-full items-center gap-2'
        data-testid='profile-identity-actions'
      >
        {onGetUpdatesClick ? (
          <div className={PILL_HIT_SLOT_CLASS_NAME}>
            <span aria-hidden='true' className={PILL_FACE_CLASS_NAME}>
              {isSubscribed ? (
                <Check className='h-3.5 w-3.5' aria-hidden='true' />
              ) : (
                <Bell className='h-3.5 w-3.5' aria-hidden='true' />
              )}
              {isSubscribed ? 'Updates On' : 'Get Updates'}
            </span>
            <Button
              type='button'
              variant='ghost'
              aria-label={isSubscribed ? 'Updates On' : 'Get Updates'}
              onClick={onGetUpdatesClick}
              className={PILL_HIT_OVERLAY_CLASS_NAME}
              data-testid='profile-identity-get-updates'
              data-subscribed={isSubscribed ? 'true' : undefined}
            />
          </div>
        ) : hasListenDestination ? (
          <Link
            href={listenHref}
            prefetch={false}
            onClick={onListenClick}
            aria-current={isListenActive ? 'page' : undefined}
            className='group flex h-11 min-w-0 flex-1 touch-manipulation items-center focus-visible:outline-none'
            data-testid='profile-identity-listen'
          >
            <span className={PILL_FACE_CLASS_NAME}>Listen</span>
          </Link>
        ) : null}

        {renderedSocialLinks.length > 0 ? (
          <div
            className='flex min-w-0 flex-1 items-center justify-around'
            data-testid='profile-identity-social-row'
          >
            {renderedSocialLinks.map(({ link, href, platform }) => (
              <a
                key={link.id}
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                onClick={() => onSocialClick?.(link)}
                className={SOCIAL_ICON_CLASS_NAME}
                aria-label={publicLinkAriaLabel(
                  name,
                  platform,
                  publicPlatformDisplayName(platform)
                )}
              >
                <SocialIcon platform={platform} className='h-5 w-5' />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
