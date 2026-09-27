'use client';

import { IconButton } from '@jovie/ui';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  parseWhatsNewFeed,
  resolveUnseenWhatsNew,
  type UnseenWhatsNew,
  WHATS_NEW_PATH,
} from '@/lib/whats-new';

export const WHATS_NEW_LAST_SEEN_KEY = 'jovie.whatsNew.lastSeenId';
/** Let the shell settle before asking; the banner is never first paint. */
const WHATS_NEW_CHECK_DELAY_MS = 1500;

export function readWhatsNewLastSeen(): string | null {
  try {
    return globalThis.localStorage?.getItem(WHATS_NEW_LAST_SEEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeWhatsNewLastSeen(id: string): void {
  try {
    globalThis.localStorage?.setItem(WHATS_NEW_LAST_SEEN_KEY, id);
  } catch {
    // Storage can be unavailable (private mode); the banner just returns.
  }
}

/** Resolve the unseen entry, or null on any network or contract failure. */
export async function loadUnseenWhatsNew(
  fetchImpl: typeof fetch = fetch
): Promise<UnseenWhatsNew | null> {
  try {
    const response = await fetchImpl(WHATS_NEW_PATH, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const feed = parseWhatsNewFeed(await response.json());
    return feed ? resolveUnseenWhatsNew(feed, readWhatsNewLastSeen()) : null;
  } catch {
    return null;
  }
}

interface WhatsNewBannerViewProps {
  readonly unseen: UnseenWhatsNew;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}

export function WhatsNewBannerView({
  unseen,
  onOpen,
  onDismiss,
}: WhatsNewBannerViewProps) {
  const { entry, unseenCount, href } = unseen;
  const eyebrow =
    unseenCount > 1 ? `What's New · ${unseenCount} updates` : "What's New";

  const regionRef = useRef<HTMLElement>(null);

  // Escape dismisses only while focus is inside the banner.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onDismiss();
    };
    region.addEventListener('keydown', handleKeyDown);
    return () => region.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <aside
      ref={regionRef}
      aria-label="What's New"
      aria-live='polite'
      data-testid='whats-new-banner'
      data-electron-no-drag='true'
      className='w-full min-w-0 px-2 py-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-subtle ease-subtle motion-reduce:animate-none'
    >
      <div className='relative rounded-xl border border-subtle bg-surface-1 py-3 pl-3 pr-9 shadow-card'>
        <p className='flex items-center gap-1.5 text-2xs font-caption text-tertiary-token'>
          <Sparkles aria-hidden='true' className='size-3' />
          {eyebrow}
        </p>
        <p className='mt-1 truncate text-xs font-medium text-primary-token'>
          {entry.title}
        </p>
        <p className='mt-0.5 line-clamp-1 text-xs text-secondary-token'>
          {entry.summary}
        </p>
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          onClick={onOpen}
          data-testid='whats-new-banner-link'
          className='mt-2 inline-flex text-xs font-medium text-primary-token underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
        >
          See What&apos;s New
        </a>
        <IconButton
          size='xs'
          ariaLabel="Dismiss What's New"
          data-testid='whats-new-banner-dismiss'
          onClick={onDismiss}
          className='absolute right-2 top-2'
        >
          <X aria-hidden='true' className='size-3.5' />
        </IconButton>
      </div>
    </aside>
  );
}

interface WhatsNewBannerProps {
  readonly enabled: boolean;
  /** Icon-only sidebar: the card has no room, so it waits until expanded. */
  readonly collapsed?: boolean;
}

/**
 * What's New card for the sidebar dock (Mac app and web shells), sidebar
 * width and in flow above now-playing. Silent while loading, when nothing is
 * unseen, and on any failure.
 */
export function WhatsNewBanner({
  enabled,
  collapsed = false,
}: WhatsNewBannerProps) {
  const [unseen, setUnseen] = useState<UnseenWhatsNew | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadUnseenWhatsNew().then(result => {
        if (!cancelled) setUnseen(result);
      });
    }, WHATS_NEW_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);

  if (!enabled || collapsed || !unseen) return null;

  const dismiss = () => {
    writeWhatsNewLastSeen(unseen.entry.id);
    setUnseen(null);
  };
  // Keep the link mounted until its own navigation has started.
  const open = () => {
    writeWhatsNewLastSeen(unseen.entry.id);
    setTimeout(() => setUnseen(null), 0);
  };

  return (
    <WhatsNewBannerView unseen={unseen} onOpen={open} onDismiss={dismiss} />
  );
}
