'use client';

import { shortTooltipTitle } from '@jovie/copy/tooltip-copy';
import { IconButton } from '@jovie/ui';
import { ArrowUp, AudioLines, Download, X } from 'lucide-react';
import Link from 'next/link';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { banner } from '@/components/feedback/banner-store';
import { APP_ROUTES } from '@/constants/routes';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { WhatsNewEntry } from '@/lib/whats-new';
import { InstallBanner } from './InstallBanner';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

export interface SidebarDockStatus {
  readonly badges: ReactNode;
  readonly label: string;
}

export interface SidebarDockProps {
  readonly userId: string;
  readonly collapsed?: boolean;
  /** The desktop app's one update control; absent in web builds. */
  readonly updateControl?: SidebarDockUpdateControl;
  readonly release?: WhatsNewEntry | null;
  readonly audio?: React.ComponentProps<typeof SidebarBottomNowPlaying> & {
    readonly reserved?: boolean;
  };
  readonly install?: {
    readonly isIOS?: boolean;
    readonly onInstall: () => void;
    readonly onDismiss: () => void;
  };
  readonly children?: (status: SidebarDockStatus | undefined) => ReactNode;
}

export interface SidebarDockUpdateControl {
  /** False while the updater has nothing to show. */
  readonly visible: boolean;
  /** Status for the notice bus and the collapsed rail's badge label. */
  readonly label: string | null;
  /** A failure outranks the other sidebar notices. */
  readonly urgent: boolean;
  readonly node: ReactNode;
}

export function sidebarDockSeenKey(userId: string): string {
  return `jovie.sidebarDock.${encodeURIComponent(userId)}.seenRelease`;
}

/** One owner for order, persistence and the icon-only user-menu status. */
export function SidebarDock({
  userId,
  collapsed = false,
  updateControl,
  release,
  audio,
  install,
  children,
}: SidebarDockProps) {
  const regionRef = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const measuredStack = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();
  const [seen, setSeen] = useState<{ key: string; id: string | null } | null>(
    null
  );
  const key = sidebarDockSeenKey(userId);

  useEffect(() => {
    try {
      setSeen({ key, id: globalThis.localStorage.getItem(key) });
    } catch {
      setSeen({ key, id: null });
    }
  }, [key]);

  const showRelease = Boolean(
    userId && release && seen?.key === key && seen.id !== release.id
  );
  const updateLabel = updateControl?.visible ? updateControl.label : null;
  const updateUrgent = updateControl?.urgent ?? false;
  const showUpdate = Boolean(updateLabel);
  const activeNotice = useSyncExternalStore(
    banner.subscribe,
    banner.getActiveBanner,
    () => null
  );
  const noticePrefix = `sidebar:${userId}:`;
  useEffect(() => {
    const id = `${noticePrefix}update`;
    if (showUpdate && !collapsed && updateLabel)
      banner.show({
        id,
        title: updateLabel,
        priority: updateUrgent ? 1000 : 300,
        placement: 'sidebar',
      });
    return () => banner.dismiss(id);
  }, [noticePrefix, showUpdate, collapsed, updateLabel, updateUrgent]);
  useEffect(() => {
    const id = `${noticePrefix}release`;
    if (showRelease && !collapsed)
      banner.show({
        id,
        title: "What's new",
        priority: 100,
        placement: 'sidebar',
      });
    return () => banner.dismiss(id);
  }, [noticePrefix, showRelease, collapsed]);
  const hasInstall = Boolean(install);
  useEffect(() => {
    const id = `${noticePrefix}install`;
    if (hasInstall && !collapsed)
      banner.show({
        id,
        title: 'Install Jovie',
        priority: 0,
        placement: 'sidebar',
      });
    return () => banner.dismiss(id);
  }, [noticePrefix, hasInstall, collapsed]);
  const selected = (kind: string) =>
    activeNotice?.id === `${noticePrefix}${kind}`;
  const showAudio = Boolean(audio?.track.trackTitle || audio?.track.artworkUrl);
  const audioLabel = audio
    ? `${audio.isPlaying ? 'Playing' : 'Paused'}: ${audio.track.trackTitle ?? 'Audio'}`
    : '';
  const statusLabels = [
    showUpdate && updateLabel,
    // Tooltip copy rule: a short title only. The story lives on /changelog,
    // which the expanded What's new card links to.
    showRelease && `What's new: ${shortTooltipTitle(release?.title ?? '')}`,
    showAudio && audioLabel,
    install && 'Install Jovie',
  ].filter(Boolean);

  // FLIP only the cards' paint positions. Footer geometry resolves locally;
  // the flex-1 nav retains its top edge and scroll position. Tokens own timing.
  // Measuring forces a layout, so it runs only when the card stack changes.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const stack = Array.from(
      region.querySelectorAll<HTMLElement>('[data-dock-card]'),
      card => card.dataset.dockCard
    ).join();
    if (stack === measuredStack.current) return;
    measuredStack.current = stack;
    const style = getComputedStyle(region);
    const duration = style.getPropertyValue('--duration-normal').trim();
    const milliseconds =
      Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    const next = new Map<string, number>();
    for (const card of region.querySelectorAll<HTMLElement>(
      '[data-dock-card]'
    )) {
      const id = card.dataset.dockCard ?? '';
      const top = card.getBoundingClientRect().top;
      next.set(id, top);
      const previous = positions.current.get(id);
      if (
        !reducedMotion &&
        milliseconds > 0 &&
        card.animate &&
        previous !== top
      ) {
        card.animate(
          previous === undefined
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { transform: `translateY(${previous - top}px)` },
                { transform: 'translateY(0)' },
              ],
          {
            duration: milliseconds,
            easing: style.getPropertyValue('--ease-out').trim() || 'linear',
          }
        );
      }
    }
    positions.current = next;
  });

  const returnFocus = () => {
    const region = regionRef.current;
    if (!region?.contains(document.activeElement)) return;
    requestAnimationFrame(() => {
      const target =
        region.querySelector<HTMLElement>('a[href],button:not(:disabled)') ??
        region.parentElement?.querySelector<HTMLElement>(
          '[data-slot="common-dropdown-trigger"]'
        );
      target?.focus({ preventScroll: true });
    });
  };
  const markSeen = () => {
    if (!release) return;
    setSeen({ key, id: release.id });
    try {
      globalThis.localStorage.setItem(key, release.id);
    } catch {
      /* In-memory dismissal still works. */
    }
  };

  const badgeStatus =
    collapsed && statusLabels.length
      ? {
          label: statusLabels.join(' · '),
          badges: (
            <span
              aria-hidden='true'
              data-dock-badges
              className='pointer-events-none absolute -right-1 -top-1 flex items-center rounded-full bg-sidebar text-primary-token ring-1 ring-sidebar-border'
            >
              {showUpdate ? (
                <ArrowUp data-dock-badge='update' className='size-2.5' />
              ) : null}
              {showRelease ? (
                <span
                  data-dock-badge='whats-new'
                  className='size-1.5 rounded-full bg-primary'
                />
              ) : null}
              {showAudio ? (
                <AudioLines data-dock-badge='audio' className='size-2.5' />
              ) : null}
              {install ? (
                <Download data-dock-badge='install' className='size-2.5' />
              ) : null}
            </span>
          ),
        }
      : undefined;

  return (
    <>
      <section
        ref={regionRef}
        data-sidebar-dock='true'
        aria-label='Sidebar Dock'
        className='flex shrink-0 flex-col gap-1 overflow-visible px-2'
      >
        {!collapsed && showUpdate && selected('update') ? (
          <section
            data-dock-card='update'
            aria-label='App Update'
            // min-h-9 holds the control's fixed row while its chunk loads.
            className='min-h-9 rounded-md border border-subtle bg-sidebar px-2'
          >
            {updateControl?.node}
          </section>
        ) : null}
        {!collapsed && showRelease && release && selected('release') ? (
          <section
            data-dock-card='whats-new'
            aria-label="What's New"
            className='flex items-center gap-1 rounded-md border border-subtle bg-sidebar p-2'
          >
            <Link
              href={APP_ROUTES.CHANGELOG}
              prefetch={false}
              onClick={markSeen}
              className='min-w-0 flex-1 rounded-sm text-xs text-primary-token focus-ring-themed'
            >
              <span className='block font-medium'>What&apos;s new</span>
              <span className='block truncate text-2xs text-secondary-token'>
                {release.title}
              </span>
            </Link>
            <IconButton
              size='sm'
              ariaLabel="Dismiss what's new"
              onClick={() => {
                returnFocus();
                markSeen();
              }}
            >
              <X className='size-3' />
            </IconButton>
          </section>
        ) : null}
        {!collapsed && showAudio && audio ? (
          <div
            data-dock-card='now-playing'
            data-state={audio.reserved ? 'reserved' : 'visible'}
            aria-hidden={audio.reserved || undefined}
            inert={audio.reserved || undefined}
            className={`rounded-md border border-subtle bg-sidebar ${audio.reserved ? 'invisible' : ''}`}
          >
            <SidebarBottomNowPlaying
              {...audio}
              onDismiss={() => {
                returnFocus();
                audio.onDismiss?.();
              }}
            />
          </div>
        ) : null}
        {!collapsed && install && selected('install') ? (
          <div data-dock-card='install'>
            <InstallBanner
              open
              onDismiss={() => {
                returnFocus();
                install.onDismiss();
              }}
              onCta={install.onInstall}
              title='Install Jovie'
              description={
                install.isIOS
                  ? 'In Safari, tap Share, then Add to Home Screen.'
                  : 'Open Jovie from your home screen.'
              }
              ctaLabel={install.isIOS ? 'Got it' : 'Install'}
            />
          </div>
        ) : null}
      </section>
      {children?.(badgeStatus)}
    </>
  );
}
