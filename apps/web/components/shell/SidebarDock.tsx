'use client';

import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui';
import {
  ArrowUp,
  AudioLines,
  CircleAlert,
  Download,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react';
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
import type { DesktopUpdateViewState } from '@/lib/desktop/desktop-updates';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { WhatsNewEntry } from '@/lib/whats-new';
import { SidebarBottomNowPlaying } from './SidebarBottomNowPlaying';

export interface SidebarDockStatus {
  readonly badges: ReactNode;
  readonly label: string;
}

export interface SidebarDockProps {
  readonly userId: string;
  readonly collapsed?: boolean;
  readonly update?: DesktopUpdateViewState;
  readonly onUpdate?: () => void;
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

export function sidebarDockSeenKey(userId: string): string {
  return `jovie.sidebarDock.${encodeURIComponent(userId)}.seenRelease`;
}

/** One owner for order, persistence and the icon-only user-menu status. */
export function SidebarDock({
  userId,
  collapsed = false,
  update,
  onUpdate,
  release,
  audio,
  install,
  children,
}: SidebarDockProps) {
  const regionRef = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, number>());
  const reducedMotion = useReducedMotion();
  const [seen, setSeen] = useState<{ key: string; id: string | null } | null>(
    null
  );
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
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
  const updateLabel =
    update?.state === 'available'
      ? 'Update available'
      : update?.state === 'downloading'
        ? `Downloading ${Math.round(update.percent)}%`
        : update?.state === 'ready'
          ? 'Restart to update'
          : update?.state === 'error'
            ? 'Update failed'
            : null;
  const updateId =
    update?.state === 'available' ? `${userId}:${update.version}` : null;
  const showUpdate = Boolean(
    updateLabel && (!updateId || dismissedUpdate !== updateId)
  );
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
        priority: update?.state === 'error' ? 1000 : 300,
        placement: 'sidebar',
      });
    return () => banner.dismiss(id);
  }, [noticePrefix, showUpdate, collapsed, updateLabel, update?.state]);
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
    showRelease && `What's new: ${release?.title}`,
    showAudio && audioLabel,
    install && 'Install Jovie',
  ].filter(Boolean);

  // FLIP only the cards' paint positions. Footer geometry resolves locally;
  // the flex-1 nav retains its top edge and scroll position. Tokens own timing.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return;
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

  const returnFocus = (fromPopover = false) => {
    const region = regionRef.current;
    if (!region || (!fromPopover && !region.contains(document.activeElement)))
      return;
    requestAnimationFrame(() => {
      // A dismissal can also focus an outside control (for example the rail
      // toggle). Recover removed focus without overriding that live target.
      const active = document.activeElement;
      if (
        active?.isConnected &&
        active !== document.body &&
        !region.contains(active)
      )
        return;
      const target =
        [
          ...region.querySelectorAll<HTMLElement>(
            'a[href],button:not(:disabled)'
          ),
        ].find(
          element => !element.closest('[inert],[hidden],[aria-hidden="true"]')
        ) ??
        region.parentElement?.querySelector<HTMLElement>(
          '[data-slot="common-dropdown-trigger"]'
        );
      target?.focus({ preventScroll: true });
    });
  };
  const restoreNoticeFocus = (event: Event, kind: string) => {
    if (!regionRef.current?.querySelector(`[data-dock-card="${kind}"]`)) {
      event.preventDefault();
      returnFocus(true);
    }
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

  const UpdateIcon =
    update?.state === 'error'
      ? CircleAlert
      : update?.state === 'downloading'
        ? Download
        : update?.state === 'ready'
          ? RotateCw
          : ArrowUp;
  const StatusIcon = showUpdate
    ? UpdateIcon
    : showAudio
      ? AudioLines
      : install
        ? Download
        : Sparkles;
  const primaryStatus = showUpdate
    ? 'update'
    : showAudio
      ? 'audio'
      : install
        ? 'install'
        : 'whats-new';
  const badgeStatus =
    collapsed && statusLabels.length
      ? {
          label: statusLabels.join(' · '),
          badges: (
            <span
              aria-hidden='true'
              data-dock-badges
              className='pointer-events-none absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-sidebar text-primary-token ring-1 ring-sidebar-border'
            >
              <StatusIcon
                data-dock-badge={primaryStatus}
                className='size-2.5'
              />
              {showRelease && primaryStatus !== 'whats-new' ? (
                <span
                  data-dock-unread
                  className='absolute -right-0.5 -top-0.5 size-1 rounded-full bg-accent'
                />
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
        <div data-dock-notice-slot className='min-h-7'>
          {!collapsed && showUpdate && selected('update') ? (
            <section
              data-dock-card='update'
              aria-label='App Update'
              className='flex min-w-0 items-center gap-1'
            >
              <Button
                size='sm'
                variant='ghost'
                onClick={onUpdate}
                className='min-w-0 flex-1 justify-start'
              >
                <span className='flex min-w-0 items-center gap-2'>
                  <UpdateIcon
                    aria-hidden='true'
                    className='size-3.5 shrink-0'
                  />
                  <span className='truncate tabular-nums'>{updateLabel}</span>
                </span>
              </Button>
              {update?.state === 'available' ? (
                <IconButton
                  size='sm'
                  ariaLabel='Dismiss update'
                  onClick={() => {
                    returnFocus();
                    setDismissedUpdate(updateId);
                  }}
                >
                  <X className='size-3' />
                </IconButton>
              ) : null}
            </section>
          ) : !collapsed && showRelease && release && selected('release') ? (
            <div data-dock-card='whats-new'>
              <Popover key={release.id}>
                <PopoverTrigger asChild>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='w-full justify-start'
                  >
                    <span className='flex items-center gap-2'>
                      <Sparkles
                        aria-hidden='true'
                        className='size-3.5 shrink-0'
                      />
                      What&apos;s New
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side='top'
                  align='start'
                  className='w-64'
                  aria-label="What's New"
                  onCloseAutoFocus={event =>
                    restoreNoticeFocus(event, 'whats-new')
                  }
                >
                  <div className='p-2'>
                    <div className='flex items-start gap-2'>
                      <div className='min-w-0 flex-1'>
                        <p className='text-xs font-medium text-primary-token'>
                          {release.title}
                        </p>
                        {release.summary ? (
                          <p className='mt-1 text-2xs text-secondary-token'>
                            {release.summary}
                          </p>
                        ) : null}
                      </div>
                      <IconButton
                        size='sm'
                        ariaLabel="Dismiss what's new"
                        onClick={() => {
                          returnFocus(true);
                          markSeen();
                        }}
                      >
                        <X className='size-3' />
                      </IconButton>
                    </div>
                    <Button
                      asChild
                      size='sm'
                      variant='secondary'
                      className='mt-3'
                    >
                      <Link
                        href={APP_ROUTES.CHANGELOG}
                        prefetch={false}
                        onClick={markSeen}
                      >
                        View Changes
                      </Link>
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ) : !collapsed && install && selected('install') ? (
            <div data-dock-card='install'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='w-full justify-start'
                  >
                    <span className='flex items-center gap-2'>
                      <Download
                        aria-hidden='true'
                        className='size-3.5 shrink-0'
                      />
                      Install Jovie
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side='top'
                  align='start'
                  className='w-64'
                  aria-label='Install Jovie'
                  onCloseAutoFocus={event =>
                    restoreNoticeFocus(event, 'install')
                  }
                >
                  <div className='p-2'>
                    <div className='flex items-start gap-2'>
                      <p className='min-w-0 flex-1 text-xs text-secondary-token'>
                        {install.isIOS
                          ? 'In Safari, tap Share, then Add to Home Screen.'
                          : 'Open Jovie from your home screen.'}
                      </p>
                      <IconButton
                        size='sm'
                        ariaLabel='Dismiss install prompt'
                        onClick={() => {
                          returnFocus(true);
                          install.onDismiss();
                        }}
                      >
                        <X className='size-3' />
                      </IconButton>
                    </div>
                    <Button
                      size='sm'
                      variant='secondary'
                      className='mt-3'
                      onClick={install.onInstall}
                    >
                      {install.isIOS ? 'Got it' : 'Install'}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
        </div>
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
      </section>
      {children?.(badgeStatus)}
    </>
  );
}
