'use client';

/**
 * SmartLinkShell — Shared layout shell for all smart link pages
 * (release, presave, sounds). Matches the artist profile card layout.
 *
 * Extracts the duplicated ambient bg, card container, hero artwork,
 * vignettes, and top bar into a single reusable component.
 */

import { IconButton } from '@jovie/ui';
import { ChevronLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useCallback } from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { Icon } from '@/components/atoms/Icon';
import {
  PublicSurfaceHeader,
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';
import { Mark } from '@/lib/brand/primitives';
import { cn } from '@/lib/utils';

/** Shared menu item styling for smart link and profile drawers */
export const SMART_LINK_MENU_ITEM_CLASS =
  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-[470] text-white/88 transition-colors duration-subtle active:bg-white/[0.06]';
export const SMART_LINK_MENU_ICON_CLASS = 'h-4 w-4 text-white/40';
// Title and artist render below clean square art, never over it ("no text on
// text", DESIGN.md). 24/32 title, 14/20 artist, 4px between.
export const SMART_LINK_HERO_TITLE_CLASS =
  'text-2xl font-semibold leading-8 tracking-tight text-(--color-text-tooltip)';
export const SMART_LINK_HERO_ARTIST_CLASS =
  'mt-1 block text-sm font-book leading-5 text-muted-foreground transition-colors duration-subtle hover:text-foreground';

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
  /** Title, artist and meta rendered in normal flow below the square art. */
  readonly heroMeta?: React.ReactNode;
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
        name='AudioLines'
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
      <IconButton
        variant='secondary'
        size='md'
        onClick={onMenuOpen}
        ariaLabel='Menu'
        aria-haspopup='dialog'
      >
        <Mark size={17} className='h-4 w-4' />
      </IconButton>
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
      <Mark size={17} className='h-4 w-4' />
    </span>
  );
}

export function SmartLinkShell({
  artworkUrl,
  artworkAlt = 'Artwork',
  children,
  heroMeta,
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
      className={cn(ARTWORK_FIT_CLASSNAME, 'object-center')}
    />
  ) : (
    <ArtworkFallback />
  );

  return (
    <PublicSurfaceShell ambientMediaUrl={artworkUrl}>
      <PublicSurfaceStage>
        {/* Hero: clean square art, then title and artist in flow. No text,
            gradient or scrim ever sits on the art (DESIGN.md rule 8). */}
        <header className='relative w-full shrink-0 pb-1'>
          <PublicSurfaceHeader
            className='px-5 pt-[max(env(safe-area-inset-top),20px)]'
            leftSlot={
              returnHref ? (
                <IconButton
                  asChild
                  variant='secondary'
                  size='md'
                  ariaLabel={returnLabel}
                >
                  <Link href={returnHref} data-testid='smart-link-back'>
                    <ChevronLeft className='h-4 w-4' />
                  </Link>
                </IconButton>
              ) : null
            }
            rightSlot={SmartLinkHeaderRightSlot({
              onMenuOpen,
              showBrandMark,
              showMenuButton,
            })}
          />

          <div className='relative px-5 pt-4'>
            <ArtworkFrame
              size='hero'
              className='aspect-square w-full'
              data-testid='smart-link-artwork'
            >
              {artworkWrapper ? artworkWrapper(artworkImage) : artworkImage}
            </ArtworkFrame>
          </div>

          {heroMeta ? (
            <div className='relative z-10 px-5 pt-6'>{heroMeta}</div>
          ) : null}
        </header>

        {/* Content */}
        {children}
      </PublicSurfaceStage>
    </PublicSurfaceShell>
  );
}
