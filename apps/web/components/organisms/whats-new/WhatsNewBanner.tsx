'use client';

import { IconButton } from '@jovie/ui';
import { Sparkles, X } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useRailFocusReturn } from '@/components/shell/useRailFocusReturn';
import {
  parseDailyWhatsNewPrompt,
  WHATS_NEW_DAILY_DISMISS_PATH,
  WHATS_NEW_DAILY_PATH,
} from '@/lib/release-communications/prompt';
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

interface ResolvedWhatsNew {
  readonly unseen: UnseenWhatsNew;
  /** Daily-post id when the prompt came from release communications. */
  readonly postId?: string;
}

/**
 * Resolve the server-driven daily post, or null when none qualifies (no
 * material entries, dismissed, unauthenticated, or any failure). Dismissal is
 * recorded server-side per user per post, so it persists across sessions.
 */
export async function loadDailyWhatsNew(
  fetchImpl: typeof fetch = fetch
): Promise<ResolvedWhatsNew | null> {
  try {
    const response = await fetchImpl(WHATS_NEW_DAILY_PATH, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const prompt = parseDailyWhatsNewPrompt(await response.json());
    if (!prompt) return null;
    return {
      postId: prompt.postId,
      unseen: {
        entry: {
          id: prompt.postId,
          title: prompt.title,
          date: prompt.localDate,
          summary: prompt.summary,
          url: prompt.changelogUrl,
          highlights: [],
          dogfood: [],
        },
        unseenCount: prompt.materialCount,
        href: prompt.changelogUrl,
      },
    };
  } catch {
    return null;
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

/** Record a whole-post dismissal server-side; failure only re-shows later. */
function dismissDailyPost(postId: string): void {
  void fetch(WHATS_NEW_DAILY_DISMISS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId }),
  }).catch(() => {});
}

interface WhatsNewBannerViewProps {
  readonly unseen: UnseenWhatsNew;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly regionRef?: RefObject<HTMLElement | null>;
}

export function WhatsNewBannerView({
  unseen,
  onOpen,
  onDismiss,
  regionRef: providedRegionRef,
}: WhatsNewBannerViewProps) {
  const { entry, unseenCount, href } = unseen;
  const eyebrow =
    unseenCount > 1 ? `What's New · ${unseenCount} updates` : "What's New";

  const localRegionRef = useRef<HTMLElement>(null);
  const regionRef = providedRegionRef ?? localRegionRef;

  // Escape dismisses only while focus is inside the banner.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    };
    region.addEventListener('keydown', handleKeyDown);
    return () => region.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss, regionRef]);

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
          size='sm'
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
  /** Icon-only sidebar: the card has no room, so wait until it expands. */
  readonly collapsed?: boolean;
  /** Deterministic actual-component stories use the same loading contract. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * In-flow What's New card for the sidebar ambient dock. Silent while loading,
 * collapsed, when nothing is unseen, and on any failure.
 */
export function WhatsNewBanner({
  enabled,
  collapsed = false,
  fetchImpl = fetch,
}: WhatsNewBannerProps) {
  const [resolved, setResolved] = useState<ResolvedWhatsNew | null>(null);
  const regionRef = useRef<HTMLElement>(null);
  useRailFocusReturn(regionRef, !enabled || collapsed || !resolved, 'left');

  useEffect(() => {
    if (!enabled) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const daily = await loadDailyWhatsNew(fetchImpl);
        const result: ResolvedWhatsNew | null =
          daily ??
          (await loadUnseenWhatsNew(fetchImpl).then(unseen =>
            unseen ? { unseen } : null
          ));
        if (!cancelled) setResolved(result);
      })();
    }, WHATS_NEW_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, fetchImpl]);

  if (!enabled || collapsed || !resolved) return null;
  const { unseen, postId } = resolved;

  const markSeen = () => {
    if (postId) {
      dismissDailyPost(postId);
    } else {
      writeWhatsNewLastSeen(unseen.entry.id);
    }
  };

  const dismiss = () => {
    markSeen();
    setResolved(null);
  };
  // Keep the link mounted until its own navigation has started.
  const open = () => {
    markSeen();
    setTimeout(() => setResolved(null), 0);
  };

  return (
    <WhatsNewBannerView
      regionRef={regionRef}
      unseen={unseen}
      onOpen={open}
      onDismiss={dismiss}
    />
  );
}
