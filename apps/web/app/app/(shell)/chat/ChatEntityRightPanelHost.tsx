'use client';

import { Button } from '@jovie/ui';
import { QueryClientContext } from '@tanstack/react-query';
import {
  Calendar,
  CheckSquare,
  Copy,
  Disc3,
  ExternalLink,
  ImageIcon,
  Link as LinkIcon,
  MessageSquareText,
  Music2,
  UserRound,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { ReleaseTaskChecklist } from '@/components/features/dashboard/release-tasks/ReleaseTaskChecklist';
import { CompactReleasePlanUpgradeCard } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import type { EntityCardModel } from '@/components/organisms/entity-card';
import {
  chatReleaseContextToEntityCard,
  chatTourDateContextToEntityCard,
  EntityCard,
  entityCardArtStyle,
  KIND_PRESETS,
} from '@/components/organisms/entity-card';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '@/components/organisms/table';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { buildReleaseTasksRoute } from '@/constants/routes';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { resolveChatRailContextLabel } from '@/lib/chat/context-label';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { usePlanGate } from '@/lib/queries';
import { prefetchChatEntityPanelData } from '@/lib/queries/prefetch-dashboard';
import { useContactsQuery } from '@/lib/queries/useContactsQuery';
import { type EventRecord, useEventsQuery } from '@/lib/queries/useEventsQuery';
import { useReleaseEntityQuery } from '@/lib/queries/useReleaseEntityQuery';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import type { DashboardContact } from '@/types/contacts';
import {
  type ChatEntityTarget,
  type ChatRailContextKind,
  type ChatRailContextTarget,
  useChatEntityPanel,
} from './ChatEntityPanelContext';

const ProfileContactSidebar = dynamic(
  () =>
    import('@/features/dashboard/organisms/profile-contact-sidebar').then(
      mod => ({ default: mod.ProfileContactSidebar })
    ),
  { ssr: false }
);

interface ChatEntityRightPanelHostProps {
  readonly enablePreviewPanel: boolean;
  readonly enableChatEntityPanels?: boolean;
  readonly profileId?: string | null;
  readonly profileSpotifyArtistId?: string | null;
  readonly profileContext?: ChatProfileContextSummary | null;
  readonly threadTitle?: string | null;
}

export interface ChatProfileContextSummary {
  readonly id: string;
  readonly displayName?: string | null;
  readonly username?: string | null;
  readonly avatarUrl?: string | null;
  readonly completionPercentage?: number | null;
  readonly hasMusicLinks?: boolean | null;
  readonly hasSocialLinks?: boolean | null;
}

const CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME =
  'system-b-chat-entity-right-panel-shell';

function formatReleaseDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function releaseTypeLabel(type: ReleaseViewModel['releaseType']): string {
  if (type === 'ep') return 'EP';
  if (type === 'music_video') return 'Music Video';
  return type
    .replaceAll('_', ' ')
    .replaceAll(/\b\w/g, letter => letter.toUpperCase());
}

function getProfileInitials(profile: ChatProfileContextSummary): string {
  const label = profile.displayName ?? profile.username ?? 'Profile';
  const words = label
    .split(/\s+/)
    .map(word => word.trim())
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('');
  return initials || 'P';
}

function contextKindLabel(kind: ChatRailContextKind): string {
  if (kind === 'tour-date') return 'Tour Date';
  return kind
    .replaceAll('-', ' ')
    .replaceAll(/\b\w/g, letter => letter.toUpperCase());
}

function ChatRailContextIcon({
  kind,
}: Readonly<{ kind: ChatRailContextKind }>) {
  if (kind === 'profile') return <UserRound className='h-3.5 w-3.5' />;
  if (kind === 'release') return <Disc3 className='h-3.5 w-3.5' />;
  if (kind === 'event' || kind === 'tour-date') {
    return <Calendar className='h-3.5 w-3.5' />;
  }
  return <Music2 className='h-3.5 w-3.5' />;
}

function ChatProfileContextCard({
  profile,
  target,
  onDismiss,
  onOpenProfilePreview,
}: Readonly<{
  profile: ChatProfileContextSummary | null | undefined;
  target: ChatRailContextTarget;
  onDismiss: (focusKey: string) => void;
  onOpenProfilePreview?: () => void;
}>) {
  const title =
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    resolveChatRailContextLabel('profile', target.label);
  const completion =
    typeof profile?.completionPercentage === 'number'
      ? Math.round(profile.completionPercentage)
      : null;
  const meta =
    completion !== null
      ? `${completion}% Complete`
      : profile?.hasMusicLinks
        ? 'Music Connected'
        : 'Profile Context';

  return (
    <div
      data-testid='chat-rail-context-card'
      data-context-kind='profile'
      className='system-b-chat-entity-context-card group flex w-full items-stretch'
    >
      <button
        type='button'
        className='flex min-w-0 flex-1 items-center gap-0 border-0 bg-transparent p-0 text-left'
        onClick={() => onOpenProfilePreview?.()}
      >
        <div className='system-b-chat-entity-context-avatar'>
          {profile?.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt=''
              fill
              sizes='36px'
              className='object-cover'
            />
          ) : (
            <div className='flex h-full w-full items-center justify-center'>
              {profile ? getProfileInitials(profile) : 'P'}
            </div>
          )}
        </div>
        <div className='system-b-chat-entity-context-copy'>
          <p className='system-b-chat-entity-context-title'>{title}</p>
          <p className='system-b-chat-entity-context-meta'>{meta}</p>
        </div>
      </button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Dismiss Profile Context'
        onClick={() => onDismiss(target.focusKey)}
        className='system-b-chat-entity-context-dismiss'
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

function ChatRailEntityCard({
  model,
  contextKind,
  focusKey,
  onDismiss,
  contextMenuItems,
  dismissLabel,
}: Readonly<{
  model: EntityCardModel;
  contextKind: ChatRailContextKind;
  focusKey: string;
  onDismiss: (focusKey: string) => void;
  contextMenuItems?: ContextMenuItemType[];
  dismissLabel: string;
}>) {
  const card = (
    <div
      className='group relative'
      data-testid='chat-rail-context-card'
      data-context-kind={contextKind}
    >
      <EntityCard
        model={model}
        treatment='compact'
        className='w-full'
        dataTestId={`chat-rail-entity-card-${contextKind}`}
      />
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={dismissLabel}
        onClick={() => onDismiss(focusKey)}
        className='system-b-chat-entity-context-dismiss absolute right-2 top-2 z-10'
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );

  if (contextMenuItems && contextMenuItems.length > 0) {
    return <TableContextMenu items={contextMenuItems}>{card}</TableContextMenu>;
  }

  return card;
}

function ChatEntityContextCard({
  target,
  onDismiss,
  onOpenProfilePreview,
  profileSpotifyArtistId,
}: Readonly<{
  target: ChatRailContextTarget;
  onDismiss: (focusKey: string) => void;
  onOpenProfilePreview?: () => void;
  profileSpotifyArtistId?: string | null;
}>) {
  const title = resolveChatRailContextLabel(target.kind, target.label);
  const opensProfilePreview =
    target.kind === 'artist' &&
    Boolean(profileSpotifyArtistId) &&
    target.id === profileSpotifyArtistId;

  const dismissLabel = `Dismiss ${contextKindLabel(target.kind)} context`;

  if (opensProfilePreview) {
    return (
      <div
        data-testid='chat-rail-context-card'
        data-context-kind={target.kind}
        className='system-b-chat-entity-context-card group flex w-full items-stretch'
      >
        <button
          type='button'
          className='flex min-w-0 flex-1 items-center gap-0 border-0 bg-transparent p-0 text-left'
          onClick={() => onOpenProfilePreview?.()}
        >
          <div className='system-b-chat-entity-context-icon'>
            <ChatRailContextIcon kind={target.kind} />
          </div>
          <div className='system-b-chat-entity-context-copy'>
            <p className='system-b-chat-entity-context-title'>{title}</p>
            <p className='system-b-chat-entity-context-meta'>
              {contextKindLabel(target.kind)} Context
            </p>
          </div>
        </button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={dismissLabel}
          onClick={() => onDismiss(target.focusKey)}
          className='system-b-chat-entity-context-dismiss'
        >
          <X className='h-3.5 w-3.5' />
        </Button>
      </div>
    );
  }

  return (
    <div
      data-testid='chat-rail-context-card'
      data-context-kind={target.kind}
      className='system-b-chat-entity-context-card group'
    >
      <div className='system-b-chat-entity-context-icon'>
        <ChatRailContextIcon kind={target.kind} />
      </div>
      <div className='system-b-chat-entity-context-copy'>
        <p className='system-b-chat-entity-context-title'>{title}</p>
        <p className='system-b-chat-entity-context-meta'>
          {contextKindLabel(target.kind)} Context
        </p>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={dismissLabel}
        onClick={() => onDismiss(target.focusKey)}
        className='system-b-chat-entity-context-dismiss'
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

function buildChatContextMenuItems({
  title,
  href,
  onDismiss,
}: Readonly<{
  title: string;
  href?: string | null;
  onDismiss?: () => void;
}>): ContextMenuItemType[] {
  const items: ContextMenuItemType[] = [];

  if (href) {
    items.push({
      id: 'open-smart-link',
      label: 'Open Smart Link',
      icon: <ExternalLink className='h-3.5 w-3.5' />,
      onClick: () => {
        globalThis.open(href, '_blank', 'noopener,noreferrer');
      },
    });
  }

  items.push({
    id: 'copy-title',
    label: 'Copy Title',
    icon: <Copy className='h-3.5 w-3.5' />,
    onClick: () => {
      void globalThis.navigator?.clipboard?.writeText(title);
    },
  });

  if (onDismiss) {
    items.push(
      { type: 'separator' },
      {
        id: 'dismiss',
        label: 'Dismiss Context',
        icon: <X className='h-3.5 w-3.5' />,
        onClick: onDismiss,
      }
    );
  }

  return items;
}

function ChatReleaseContextCard({
  target,
  profileId,
  onDismiss,
}: Readonly<{
  target: ChatRailContextTarget;
  profileId: string;
  onDismiss: (focusKey: string) => void;
}>) {
  const { data: release = null, isLoading } = useReleaseEntityQuery(
    profileId,
    target.id
  );
  const title =
    release?.title ?? resolveChatRailContextLabel('release', target.label);
  const model = chatReleaseContextToEntityCard(
    release
      ? {
          id: release.id,
          title: release.title,
          artworkUrl: release.artworkUrl,
          releaseType: release.releaseType,
        }
      : null,
    { fallbackTitle: title, loading: isLoading }
  );

  return (
    <ChatRailEntityCard
      model={model}
      contextKind='release'
      focusKey={target.focusKey}
      onDismiss={onDismiss}
      dismissLabel='Dismiss Release Context'
      contextMenuItems={buildChatContextMenuItems({
        title,
        href: release?.smartLinkPath,
        onDismiss: () => onDismiss(target.focusKey),
      })}
    />
  );
}

function ChatTourDateContextCard({
  target,
  profileId,
  onDismiss,
}: Readonly<{
  target: ChatRailContextTarget;
  profileId: string;
  onDismiss: (focusKey: string) => void;
}>) {
  const { data, isLoading } = useEventsQuery(profileId);
  const event: EventRecord | null =
    (data ?? []).find(entry => entry.id === target.id) ?? null;
  const title =
    event?.title ?? resolveChatRailContextLabel('tour-date', target.label);
  const model = chatTourDateContextToEntityCard(
    event
      ? {
          id: event.id,
          title: event.title,
          venueName: event.venue,
          city: event.city,
          startDate: event.eventDate,
        }
      : null,
    { fallbackTitle: title, loading: isLoading }
  );

  return (
    <ChatRailEntityCard
      model={model}
      contextKind='tour-date'
      focusKey={target.focusKey}
      onDismiss={onDismiss}
      dismissLabel='Dismiss Tour Date Context'
    />
  );
}

function ChatRailContextCards({
  targets,
  profileContext,
  profileId,
  profileSpotifyArtistId,
  onDismiss,
  onOpenProfilePreview,
}: Readonly<{
  targets: readonly ChatRailContextTarget[];
  profileContext?: ChatProfileContextSummary | null;
  profileId?: string | null;
  profileSpotifyArtistId?: string | null;
  onDismiss: (focusKey: string) => void;
  onOpenProfilePreview?: () => void;
}>) {
  if (targets.length === 0) {
    return null;
  }

  return (
    <div className='shrink-0 px-2 py-2' data-testid='chat-rail-context-cards'>
      <div className='space-y-1'>
        {targets.map(target =>
          target.kind === 'profile' ? (
            <ChatProfileContextCard
              key={target.focusKey}
              profile={profileContext}
              target={target}
              onDismiss={onDismiss}
              onOpenProfilePreview={onOpenProfilePreview}
            />
          ) : target.kind === 'release' && profileId ? (
            <ChatReleaseContextCard
              key={target.focusKey}
              target={target}
              profileId={profileId}
              onDismiss={onDismiss}
            />
          ) : target.kind === 'tour-date' && profileId ? (
            <ChatTourDateContextCard
              key={target.focusKey}
              target={target}
              profileId={profileId}
              onDismiss={onDismiss}
            />
          ) : (
            <ChatEntityContextCard
              key={target.focusKey}
              target={target}
              onDismiss={onDismiss}
              onOpenProfilePreview={onOpenProfilePreview}
              profileSpotifyArtistId={profileSpotifyArtistId}
            />
          )
        )}
      </div>
    </div>
  );
}

function ChatEntityPanelSection({
  title,
  icon,
  children,
}: Readonly<{
  title: string;
  icon: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className='system-b-chat-entity-panel-section'>
      <DrawerSurfaceCard
        variant='card'
        className='system-b-chat-entity-panel-card'
      >
        <div className='system-b-chat-entity-section-heading'>
          {icon}
          <h3>{title}</h3>
        </div>
        {children}
      </DrawerSurfaceCard>
    </section>
  );
}

function ChatReleaseEntityPanel({
  release,
  label,
  loading,
  threadTitle,
  onClose,
}: Readonly<{
  release: ReleaseViewModel | null;
  label?: string | null;
  loading: boolean;
  threadTitle?: string | null;
  onClose: () => void;
}>) {
  const router = useRouter();
  const { canAccessTasksWorkspace, isLoading: isTasksWorkspaceGateLoading } =
    usePlanGate();
  const [showTasksUpgrade, setShowTasksUpgrade] = useState(true);
  const releaseDate = formatReleaseDate(release?.releaseDate);
  const releaseArtStyle = entityCardArtStyle(KIND_PRESETS.music.accent);
  const visibleProviders = release?.providers.filter(provider => provider.url);
  const hasMedia =
    Boolean(release?.artworkUrl) ||
    Boolean(release?.previewUrl) ||
    Boolean(visibleProviders && visibleProviders.length > 0);
  const shouldShowReleaseTasksSection =
    isTasksWorkspaceGateLoading || canAccessTasksWorkspace || showTasksUpgrade;
  const panelTitle = release?.title ?? label ?? 'Release';
  const smartLinkPath = release?.smartLinkPath;
  const contextMenuItems = useMemo<ContextMenuItemType[]>(
    () =>
      buildChatContextMenuItems({
        title: panelTitle,
        href: smartLinkPath,
      }),
    [panelTitle, smartLinkPath]
  );
  const headerOverflowActions = useMemo<DrawerHeaderAction[]>(() => {
    const actions: DrawerHeaderAction[] = [];

    if (smartLinkPath) {
      actions.push({
        id: 'open-smart-link',
        label: 'Open Smart Link',
        icon: ExternalLink,
        onClick: () => {
          globalThis.open(smartLinkPath, '_blank', 'noopener,noreferrer');
        },
      });
    }

    actions.push({
      id: 'copy-title',
      label: 'Copy Title',
      icon: Copy,
      onClick: () => {
        void globalThis.navigator?.clipboard?.writeText(panelTitle);
      },
    });

    return actions;
  }, [panelTitle, smartLinkPath]);

  useEffect(() => {
    setShowTasksUpgrade(true);
  }, [release?.id]);

  return (
    <TableContextMenu items={contextMenuItems}>
      <aside
        className='system-b-chat-entity-panel-surface'
        data-testid='chat-release-entity-panel'
      >
        <div className='system-b-chat-entity-panel-header'>
          <div className='system-b-chat-entity-panel-header-copy'>
            <p className='system-b-chat-entity-panel-eyebrow'>Release</p>
            <h2 className='system-b-chat-entity-panel-title'>
              {release?.title ?? label ?? 'Release'}
            </h2>
          </div>
          <DrawerHeaderActions
            primaryActions={[]}
            overflowActions={headerOverflowActions}
            onClose={onClose}
          />
        </div>

        {loading ? (
          <div
            className='system-b-chat-entity-panel-status'
            role='status'
            aria-live='polite'
          >
            <span className='sr-only'>Loading release…</span>
            <div
              className='h-4 w-28 rounded skeleton motion-reduce:animate-none'
              aria-hidden='true'
            />
          </div>
        ) : release ? (
          <div className='min-h-0 flex-1 overflow-y-auto'>
            <div className='px-4 py-4'>
              <div className='system-b-chat-release-summary'>
                <div
                  className='system-b-chat-release-artwork'
                  style={releaseArtStyle}
                >
                  {release.artworkUrl ? (
                    <Image
                      src={release.artworkUrl}
                      alt=''
                      fill
                      className='object-cover'
                      sizes='64px'
                    />
                  ) : (
                    <div className='flex h-full w-full items-center justify-center text-tertiary-token'>
                      <Disc3 className='h-5 w-5' />
                    </div>
                  )}
                </div>
                <div className='system-b-chat-release-copy'>
                  <h3 className='system-b-chat-release-title'>
                    {release.title}
                  </h3>
                  <div className='system-b-chat-entity-meta-row'>
                    <span className='system-b-chat-entity-meta-pill'>
                      <Disc3 className='h-3 w-3 text-tertiary-token' />
                      {releaseTypeLabel(release.releaseType)}
                    </span>
                    {releaseDate ? (
                      <span className='system-b-chat-entity-meta-pill'>
                        <Calendar className='h-3 w-3 text-tertiary-token' />
                        {releaseDate}
                      </span>
                    ) : null}
                    <span className='system-b-chat-entity-meta-pill'>
                      {capitalizeFirst(release.status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {release ? (
              <div className='flex flex-wrap gap-1.5 px-4 pb-4'>
                <button
                  type='button'
                  onClick={() =>
                    router.push(buildReleaseTasksRoute(release.id))
                  }
                  className='system-b-chat-entity-action-link'
                >
                  <CheckSquare className='h-3.5 w-3.5 text-tertiary-token' />
                  Tasks
                </button>
                {release.smartLinkPath ? (
                  <Link
                    href={release.smartLinkPath}
                    className='system-b-chat-entity-action-link'
                  >
                    <ExternalLink className='h-3.5 w-3.5 text-tertiary-token' />
                    Open
                  </Link>
                ) : null}
              </div>
            ) : null}

            {hasMedia ? (
              <ChatEntityPanelSection
                title='Media'
                icon={<ImageIcon className='h-3.5 w-3.5 text-tertiary-token' />}
              >
                <div className='space-y-3'>
                  {release.previewUrl ? (
                    <div className='system-b-chat-entity-audio-card'>
                      <div className='system-b-chat-entity-audio-label'>
                        <Music2 className='h-3.5 w-3.5 text-tertiary-token' />
                        Preview
                      </div>
                      <audio
                        controls
                        src={release.previewUrl}
                        className='h-8 w-full'
                      >
                        <track kind='captions' />
                      </audio>
                    </div>
                  ) : null}

                  {visibleProviders && visibleProviders.length > 0 ? (
                    <div className='space-y-1'>
                      {visibleProviders.slice(0, 6).map(provider => (
                        <a
                          key={`${provider.key}:${provider.url}`}
                          href={provider.url}
                          target='_blank'
                          rel='noreferrer'
                          className='system-b-chat-entity-provider-link'
                        >
                          <ProviderIcon
                            provider={provider.key as ProviderKey}
                            className='h-3.5 w-3.5 shrink-0'
                            aria-label={provider.label}
                          />
                          <span className='min-w-0 flex-1 truncate'>
                            {provider.label}
                          </span>
                          <span
                            className='system-b-chat-entity-provider-dot'
                            data-primary={provider.isPrimary ? 'true' : 'false'}
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </ChatEntityPanelSection>
            ) : null}

            {threadTitle ? (
              <ChatEntityPanelSection
                title='Chat'
                icon={
                  <MessageSquareText className='h-3.5 w-3.5 text-tertiary-token' />
                }
              >
                <div className='system-b-chat-entity-note-card'>
                  <p className='truncate font-semibold text-primary-token'>
                    {threadTitle}
                  </p>
                  <p className='mt-1 text-tertiary-token'>
                    This release was referenced in the current chat.
                  </p>
                </div>
              </ChatEntityPanelSection>
            ) : null}

            {shouldShowReleaseTasksSection ? (
              <ChatEntityPanelSection
                title='Tasks'
                icon={
                  <CheckSquare className='h-3.5 w-3.5 text-tertiary-token' />
                }
              >
                {isTasksWorkspaceGateLoading ? (
                  <div
                    className='rounded-lg border border-subtle bg-surface-1 px-3 py-3'
                    data-testid='chat-release-tasks-loading-state'
                  >
                    <div
                      className='h-4 w-28 rounded skeleton motion-reduce:animate-none'
                      aria-hidden='true'
                    />
                    <div
                      className='mt-3 h-20 rounded-md skeleton motion-reduce:animate-none'
                      aria-hidden='true'
                    />
                  </div>
                ) : canAccessTasksWorkspace ? (
                  <ReleaseTaskChecklist
                    releaseId={release.id}
                    variant='compact'
                    releaseDate={release.releaseDate}
                    onNavigateToFullPage={() =>
                      router.push(buildReleaseTasksRoute(release.id))
                    }
                  />
                ) : showTasksUpgrade ? (
                  <CompactReleasePlanUpgradeCard
                    onDismiss={() => setShowTasksUpgrade(false)}
                  />
                ) : null}
              </ChatEntityPanelSection>
            ) : null}
          </div>
        ) : (
          <div className='system-b-chat-entity-panel-status'>
            This release is not available in the current profile.
          </div>
        )}
      </aside>
    </TableContextMenu>
  );
}

function ChatReleaseEntityPanelLoader({
  target,
  profileId,
  threadTitle,
  onClose,
}: Readonly<{
  target: ChatEntityTarget;
  profileId: string;
  threadTitle?: string | null;
  onClose: () => void;
}>) {
  const { data: release = null, isLoading } = useReleaseEntityQuery(
    profileId,
    target.id
  );

  return (
    <ChatReleaseEntityPanel
      release={release}
      label={target.label}
      loading={isLoading}
      threadTitle={threadTitle}
      onClose={onClose}
    />
  );
}

function ChatSimpleEntityPanel({
  eyebrow,
  title,
  loading,
  emptyMessage,
  onClose,
  children,
  testId,
}: Readonly<{
  eyebrow: string;
  title: string;
  loading: boolean;
  emptyMessage: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}>) {
  const hasContent = !loading && children !== null;
  return (
    <aside className='system-b-chat-entity-panel-surface' data-testid={testId}>
      <div className='system-b-chat-entity-panel-header'>
        <div className='system-b-chat-entity-panel-header-copy'>
          <p className='system-b-chat-entity-panel-eyebrow'>{eyebrow}</p>
          <h2 className='system-b-chat-entity-panel-title'>{title}</h2>
        </div>
        <DrawerHeaderActions
          primaryActions={[]}
          overflowActions={[]}
          onClose={onClose}
        />
      </div>
      {loading ? (
        <div className='system-b-chat-entity-panel-status'>Loading…</div>
      ) : hasContent ? (
        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4'>
          {children}
        </div>
      ) : (
        <div className='system-b-chat-entity-panel-status'>{emptyMessage}</div>
      )}
    </aside>
  );
}

function ChatContactEntityPanelLoader({
  target,
  profileId,
  onClose,
}: Readonly<{
  target: ChatEntityTarget;
  profileId: string;
  onClose: () => void;
}>) {
  const { data, isLoading } = useContactsQuery(profileId);
  const contact: DashboardContact | null =
    (data ?? []).find(c => c.id === target.id) ?? null;
  const title =
    contact?.personName?.trim() ||
    contact?.companyName?.trim() ||
    target.label ||
    'Contact';
  return (
    <ChatSimpleEntityPanel
      eyebrow='Contact'
      title={title}
      loading={isLoading}
      emptyMessage='This contact is not available in the current profile.'
      onClose={onClose}
      testId='chat-contact-entity-panel'
    >
      {contact ? (
        <div className='system-b-chat-contact-details'>
          {contact.role ? (
            <span className='system-b-chat-entity-meta-pill'>
              {contact.role}
            </span>
          ) : null}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className='system-b-chat-entity-provider-link'
            >
              <LinkIcon className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <span className='truncate'>{contact.email}</span>
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className='system-b-chat-entity-provider-link'
            >
              <LinkIcon className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <span className='truncate'>{contact.phone}</span>
            </a>
          ) : null}
          {contact.territories.length > 0 ? (
            <p className='system-b-chat-contact-copy'>
              {contact.territories.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </ChatSimpleEntityPanel>
  );
}

function ChatTourDateEntityPanelLoader({
  target,
  profileId,
  onClose,
}: Readonly<{
  target: ChatEntityTarget;
  profileId: string;
  onClose: () => void;
}>) {
  const { data, isLoading } = useEventsQuery(profileId);
  const event: EventRecord | null =
    (data ?? []).find(e => e.id === target.id) ?? null;
  const eventDate = formatReleaseDate(event?.eventDate);
  const title = event?.title ?? target.label ?? 'Tour date';
  return (
    <ChatSimpleEntityPanel
      eyebrow='Tour date'
      title={title}
      loading={isLoading}
      emptyMessage='This tour date is not available in the current profile.'
      onClose={onClose}
      testId='chat-tour-date-entity-panel'
    >
      {event ? (
        <div className='space-y-3'>
          <div className='system-b-chat-entity-meta-row'>
            {eventDate ? (
              <span className='system-b-chat-entity-meta-pill'>
                <Calendar className='h-3 w-3 text-tertiary-token' />
                {eventDate}
              </span>
            ) : null}
            {event.status ? (
              <span className='system-b-chat-entity-meta-pill'>
                {event.status}
              </span>
            ) : null}
            {event.provider ? (
              <span className='system-b-chat-entity-meta-pill'>
                {event.provider}
              </span>
            ) : null}
          </div>
          {event.subtitle ? (
            <p className='system-b-chat-contact-copy'>{event.subtitle}</p>
          ) : null}
        </div>
      ) : null}
    </ChatSimpleEntityPanel>
  );
}

export function ChatEntityRightPanelHost({
  enablePreviewPanel,
  enableChatEntityPanels = false,
  profileId,
  profileSpotifyArtistId,
  profileContext,
  threadTitle,
}: Readonly<ChatEntityRightPanelHostProps>) {
  const { open: openPreviewPanel, isOpen: isPreviewPanelOpen } =
    usePreviewPanelState();
  const { target, contextTargets, close, dismissContext } =
    useChatEntityPanel();
  // Nullable so the host also renders outside a QueryClientProvider (tests).
  const queryClient = useContext(QueryClientContext);

  // Warm the panel data caches up front so clicking an entity chip opens a
  // fully-painted panel — never a loading state on drawer open (JOV-3800).
  useEffect(() => {
    if (!enableChatEntityPanels || !profileId || !queryClient) return;
    prefetchChatEntityPanelData(queryClient, profileId);
  }, [enableChatEntityPanels, profileId, queryClient]);

  const handleOpenProfilePreview = useCallback(() => {
    close();
    openPreviewPanel();
  }, [close, openPreviewPanel]);

  const panel = useMemo(() => {
    const contextCards =
      enableChatEntityPanels && profileId && contextTargets.length > 0 ? (
        <ChatRailContextCards
          targets={contextTargets}
          profileContext={profileContext}
          profileId={profileId}
          profileSpotifyArtistId={profileSpotifyArtistId}
          onDismiss={dismissContext}
          onOpenProfilePreview={handleOpenProfilePreview}
        />
      ) : null;
    let entityPanel: ReactNode = null;

    if (enableChatEntityPanels && profileId && target) {
      if (target.kind === 'release') {
        entityPanel = (
          <ChatReleaseEntityPanelLoader
            target={target}
            profileId={profileId}
            threadTitle={threadTitle}
            onClose={close}
          />
        );
      }
      if (target.kind === 'contact') {
        entityPanel = (
          <ChatContactEntityPanelLoader
            target={target}
            profileId={profileId}
            onClose={close}
          />
        );
      }
      if (target.kind === 'tour-date') {
        entityPanel = (
          <ChatTourDateEntityPanelLoader
            target={target}
            profileId={profileId}
            onClose={close}
          />
        );
      }
    }

    // Only render the profile preview card when the preview panel is actually
    // open. A closed RightDrawer collapses to zero width *inside* the card, so
    // keeping this wrapper mounted registers a non-null right panel and leaves
    // a ghost empty card + reserved rail width in the app shell (gh-12134).
    const liveProfilePreview =
      enablePreviewPanel && isPreviewPanelOpen ? (
        <ErrorBoundary fallback={null}>
          <div className='system-b-chat-profile-preview-card'>
            <ProfileContactSidebar />
          </div>
        </ErrorBoundary>
      ) : null;

    if (contextCards && entityPanel) {
      return (
        <aside
          className={cn(CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME, 'flex-col')}
          data-testid='chat-rail-context-and-entity-panel'
        >
          <div className='system-b-chat-entity-panel-context-divider shrink-0'>
            {contextCards}
          </div>
          <div className='min-h-0 flex-1'>{entityPanel}</div>
        </aside>
      );
    }

    if (entityPanel) {
      return (
        <div
          className={CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME}
          data-testid='chat-entity-panel-shell'
        >
          {entityPanel}
        </div>
      );
    }

    if (contextCards && liveProfilePreview) {
      return (
        <aside
          className={cn(CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME, 'flex-col')}
          data-testid='chat-rail-context-and-profile-preview'
        >
          <div className='system-b-chat-entity-panel-context-divider shrink-0'>
            {contextCards}
          </div>
          <div className='min-h-0 flex-1'>{liveProfilePreview}</div>
        </aside>
      );
    }

    if (liveProfilePreview) {
      return liveProfilePreview;
    }

    if (contextCards) {
      return (
        <aside
          className={cn(CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME, 'flex-col')}
          data-testid='chat-rail-context-only-panel'
        >
          {contextCards}
        </aside>
      );
    }

    if (target) {
      // Flag off, no profileId, or unsupported kind: keep the rail empty
      // (don't fall through to the profile preview while a target is active).
      return null;
    }

    return null;
  }, [
    close,
    contextTargets,
    dismissContext,
    enableChatEntityPanels,
    enablePreviewPanel,
    handleOpenProfilePreview,
    isPreviewPanelOpen,
    profileId,
    profileSpotifyArtistId,
    profileContext,
    target,
    threadTitle,
  ]);

  useRegisterRightPanel(panel);

  return null;
}
