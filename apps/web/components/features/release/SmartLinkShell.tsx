'use client';

/**
 * SmartLinkShell — Shared layout shell for all smart link pages
 * (release, presave, sounds). Matches the artist profile card layout.
 *
 * Extracts the duplicated ambient bg, card container, hero artwork,
 * vignettes, and top bar into a single reusable component.
 */

import { ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  PublicSurfaceHeader,
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';
import { Mark } from '@/lib/brand/primitives';

/** Shared menu item styling for smart link and profile drawers */
export const SMART_LINK_MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-subtle active:bg-white/[0.06]';
export const SMART_LINK_MENU_ICON_CLASS = 'h-[16px] w-[16px] text-white/40';

/** Hook for the share action used across all smart link pages */
export function useSmartLinkShare(
  title: string,
  artistName: string,
  onClose?: () => void
) {
  return useCallback(async () => {
    onClose?.();
    const url = globalThis.location.href;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${title} — ${artistName}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // User cancelled or clipboard/share unavailable
    }
  }, [title, artistName, onClose]);
}

type SmartLinkShellBaseProps = {
  readonly artworkUrl: string | null;
  readonly artworkAlt?: string;
  readonly children: React.ReactNode;
  /** Content overlaid at the bottom of the hero artwork (title, artist, play button) */
  readonly heroOverlay?: React.ReactNode;
  readonly showBrandMark?: boolean;
  readonly returnHref?: string | null;
  readonly returnLabel?: string;
  /** Wraps the artwork image (e.g., for context menu). Must render a relative h-full w-full container. */
  readonly artworkWrapper?: (img: React.ReactNode) => React.ReactNode;
};

type SmartLinkShellProps =
  | (SmartLinkShellBaseProps & {
      readonly showMenuButton?: true;
      readonly onMenuOpen: () => void;
    })
  | (SmartLinkShellBaseProps & {
      readonly showMenuButton: false;
      readonly onMenuOpen?: () => void;
    });

function ArtworkFallback() {
  return (
    <div className='flex h-full w-full items-center justify-center bg-surface-2'>
      <Icon
        name='Disc3'
        className='text-muted-foreground h-16 w-16'
        aria-hidden='true'
      />
    </div>
  );
}

function SmartLinkHeaderRightSlot({
  onMenuOpen,
  showBrandMark,
  showMenuButton,
}: {
  readonly onMenuOpen?: () => void;
  readonly showBrandMark: boolean;
  readonly showMenuButton: boolean;
}): ReactNode {
  if (showMenuButton && onMenuOpen) {
    return (
      <button
        type='button'
        onClick={onMenuOpen}
        className='flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-black/25 text-white/70 backdrop-blur-2xl transition-colors duration-subtle hover:bg-black/40'
        aria-label='Menu'
        aria-haspopup='dialog'
      >
        <Mark size={17} className='h-[17px] w-[17px]' />
      </button>
    );
  }

  if (!showBrandMark) {
    return null;
  }

  return (
    <span
      className='flex h-8 w-8 items-center justify-center text-white/48 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
      data-testid='smart-link-brand-mark'
    >
      <Mark size={17} className='h-[17px] w-[17px]' />
    </span>
  );
}

export function SmartLinkShell({
  artworkUrl,
  artworkAlt = 'Artwork',
  children,
  heroOverlay,
  onMenuOpen,
  showBrandMark = true,
  showMenuButton = true,
  returnHref,
  returnLabel = 'Back',
  artworkWrapper,
}: SmartLinkShellProps) {
  const artworkImage = artworkUrl ? (
    <Image
      src={artworkUrl}
      alt={artworkAlt}
      fill
      priority
      sizes='(max-width: 767px) 100vw, 430px'
      className='object-cover object-center'
    />
  ) : (
    <ArtworkFallback />
  );

  return (
    <PublicSurfaceShell ambientMediaUrl={artworkUrl}>
      <PublicSurfaceStage>
        {/* Hero */}
        <header className='relative w-full shrink-0 aspect-[4/3] md:aspect-square'>
          <div className='absolute inset-0'>
            {artworkWrapper ? artworkWrapper(artworkImage) : artworkImage}
          </div>

          {/* Vignettes */}
          <div className='pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.15)_55%,transparent_100%)]' />
          <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,var(--profile-stage-bg,rgba(8,9,10,1))_0%,rgba(5,6,8,0.75)_45%,transparent_100%)]' />

          <PublicSurfaceHeader
            className='px-5 pt-[max(env(safe-area-inset-top),20px)]'
            leftSlot={
              returnHref ? (
                <Link
                  href={returnHref}
                  className='flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-black/25 text-white/70 backdrop-blur-2xl transition-colors duration-subtle hover:bg-black/40'
                  aria-label={returnLabel}
                  data-testid='smart-link-back'
                >
                  <ChevronLeft className='h-[16px] w-[16px]' />
                </Link>
              ) : null
            }
            rightSlot={SmartLinkHeaderRightSlot({
              onMenuOpen,
              showBrandMark,
              showMenuButton,
            })}
          />

          {/* Hero overlay */}
          {heroOverlay}
        </header>

        {/* Content */}
        {children}
      </PublicSurfaceStage>
    </PublicSurfaceShell>
  );
}
