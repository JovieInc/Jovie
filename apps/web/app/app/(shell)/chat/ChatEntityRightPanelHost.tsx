'use client';

import { Button } from '@jovie/ui';
import {
  Calendar,
  CheckSquare,
  Disc3,
  ImageIcon,
  Link as LinkIcon,
  MessageSquareText,
  Music2,
  UserRound,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ReleaseTaskChecklist } from '@/components/features/dashboard/release-tasks/ReleaseTaskChecklist';
import { CompactReleasePlanUpgradeCard } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { buildReleaseTasksRoute } from '@/constants/routes';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { usePlanGate } from '@/lib/queries';
import { useContactsQuery } from '@/lib/queries/useContactsQuery';
import { type EventRecord, useEventsQuery } from '@/lib/queries/useEventsQuery';
import { useReleaseEntityQuery } from '@/lib/queries/useReleaseEntityQuery';
import { cn } from '@/lib/utils';
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
  'hidden h-full min-h-0 w-[320px] shrink-0 overflow-hidden bg-(--linear-app-content-surface) lg:flex xl:w-[340px]';

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
}: Readonly<{
  profile: ChatProfileContextSummary | null | undefined;
  target: ChatRailContextTarget;
  onDismiss: (focusKey: string) => void;
}>) {
  const title =
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    target.label ||
    'Profile';
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
      className='group relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-1'
    >
      <div className='relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-1 text-[12px] font-semibold text-secondary-token'>
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
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
          {title}
        </p>
        <p className='truncate text-[11.5px] text-tertiary-token'>{meta}</p>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Dismiss profile context'
        onClick={() => onDismiss(target.focusKey)}
        className='h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

function ChatEntityContextCard({
  target,
  onDismiss,
}: Readonly<{
  target: ChatRailContextTarget;
  onDismiss: (focusKey: string) => void;
}>) {
  const title = target.label?.trim() || contextKindLabel(target.kind);
  return (
    <div
      data-testid='chat-rail-context-card'
      data-context-kind={target.kind}
      className='group relative flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-1'
    >
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.08] text-cyan-300'>
        <ChatRailContextIcon kind={target.kind} />
      </div>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[13px] font-semibold text-primary-token'>
          {title}
        </p>
        <p className='truncate text-[11.5px] text-tertiary-token'>
          {contextKindLabel(target.kind)} Context
        </p>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={`Dismiss ${contextKindLabel(target.kind)} context`}
        onClick={() => onDismiss(target.focusKey)}
        className='h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
      >
        <X className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
}

function ChatRailContextCards({
  targets,
  profileContext,
  onDismiss,
}: Readonly<{
  targets: readonly ChatRailContextTarget[];
  profileContext?: ChatProfileContextSummary | null;
  onDismiss: (focusKey: string) => void;
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
            />
          ) : (
            <ChatEntityContextCard
              key={target.focusKey}
              target={target}
              onDismiss={onDismiss}
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
    <section className='border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_58%,transparent)] px-4 py-4'>
      <div className='mb-3 flex items-center gap-2 text-[12px] font-semibold text-secondary-token'>
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
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
  const visibleProviders = release?.providers.filter(provider => provider.url);
  const hasMedia =
    Boolean(release?.artworkUrl) ||
    Boolean(release?.previewUrl) ||
    Boolean(visibleProviders && visibleProviders.length > 0);
  const shouldShowReleaseTasksSection =
    isTasksWorkspaceGateLoading || canAccessTasksWorkspace || showTasksUpgrade;

  useEffect(() => {
    setShowTasksUpgrade(true);
  }, [release?.id]);

  return (
    <aside
      className='flex h-full min-h-0 w-full flex-col overflow-hidden bg-(--linear-app-content-surface)'
      data-testid='chat-release-entity-panel'
    >
      <div className='flex shrink-0 items-center justify-between border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_64%,transparent)] px-4 py-3'>
        <div className='min-w-0'>
          <p className='text-[11px] text-tertiary-token'>Release</p>
          <h2 className='truncate text-[13px] font-semibold text-primary-token'>
            {release?.title ?? label ?? 'Release'}
          </h2>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Close entity panel'
          onClick={onClose}
          className='h-8 w-8 shrink-0'
        >
          <X className='h-4 w-4' />
        </Button>
      </div>

      {loading ? (
        <div
          className='flex flex-1 items-center justify-center px-6'
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
            <div className='flex items-start gap-3'>
              <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-1'>
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
              <div className='min-w-0 flex-1'>
                <h3 className='text-[17px] font-semibold leading-tight text-primary-token'>
                  {release.title}
                </h3>
                <div className='mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-secondary-token'>
                  <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-1.5 py-1'>
                    <Disc3 className='h-3 w-3 text-tertiary-token' />
                    {releaseTypeLabel(release.releaseType)}
                  </span>
                  {releaseDate ? (
                    <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-1.5 py-1'>
                      <Calendar className='h-3 w-3 text-tertiary-token' />
                      {releaseDate}
                    </span>
                  ) : null}
                  <span className='rounded-md bg-surface-1 px-1.5 py-1'>
                    {release.status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {hasMedia ? (
            <ChatEntityPanelSection
              title='Media'
              icon={<ImageIcon className='h-3.5 w-3.5 text-tertiary-token' />}
            >
              <div className='space-y-3'>
                {release.previewUrl ? (
                  <div className='rounded-lg bg-surface-1 px-3 py-2.5'>
                    <div className='mb-2 flex items-center gap-2 text-[11.5px] font-semibold text-secondary-token'>
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
                        className='flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-secondary-token transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:bg-surface-1 focus-visible:outline-none'
                      >
                        <LinkIcon className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                        <span className='min-w-0 flex-1 truncate'>
                          {provider.label}
                        </span>
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            provider.isPrimary
                              ? 'bg-green-500'
                              : 'bg-tertiary-token'
                          )}
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
              title='Thread'
              icon={
                <MessageSquareText className='h-3.5 w-3.5 text-tertiary-token' />
              }
            >
              <div className='rounded-lg bg-surface-1 px-3 py-2.5 text-[12px] text-secondary-token'>
                <p className='truncate font-semibold text-primary-token'>
                  {threadTitle}
                </p>
                <p className='mt-1 text-tertiary-token'>
                  This release was referenced in the current chat thread.
                </p>
              </div>
            </ChatEntityPanelSection>
          ) : null}

          {shouldShowReleaseTasksSection ? (
            <ChatEntityPanelSection
              title='Tasks'
              icon={<CheckSquare className='h-3.5 w-3.5 text-tertiary-token' />}
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
        <div className='flex flex-1 items-center justify-center px-6 text-center text-[13px] text-tertiary-token'>
          This release is not available in the current profile.
        </div>
      )}
    </aside>
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
    <aside
      className='flex h-full min-h-0 w-full flex-col overflow-hidden bg-(--linear-app-content-surface)'
      data-testid={testId}
    >
      <div className='flex shrink-0 items-center justify-between border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_64%,transparent)] px-4 py-3'>
        <div className='min-w-0'>
          <p className='text-[11px] text-tertiary-token'>{eyebrow}</p>
          <h2 className='truncate text-[13px] font-semibold text-primary-token'>
            {title}
          </h2>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Close entity panel'
          onClick={onClose}
          className='h-8 w-8 shrink-0'
        >
          <X className='h-4 w-4' />
        </Button>
      </div>
      {loading ? (
        <div className='flex flex-1 items-center justify-center px-6 text-center text-[13px] text-tertiary-token'>
          Loading…
        </div>
      ) : hasContent ? (
        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4'>
          {children}
        </div>
      ) : (
        <div className='flex flex-1 items-center justify-center px-6 text-center text-[13px] text-tertiary-token'>
          {emptyMessage}
        </div>
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
        <div className='space-y-2 text-[12px] text-secondary-token'>
          {contact.role ? (
            <span className='inline-flex items-center rounded-md bg-surface-1 px-1.5 py-1 text-[11px]'>
              {contact.role}
            </span>
          ) : null}
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className='flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-1 hover:text-primary-token'
            >
              <LinkIcon className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <span className='truncate'>{contact.email}</span>
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className='flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-1 hover:text-primary-token'
            >
              <LinkIcon className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <span className='truncate'>{contact.phone}</span>
            </a>
          ) : null}
          {contact.territories.length > 0 ? (
            <p className='text-[12px] text-secondary-token'>
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
          <div className='flex flex-wrap items-center gap-1.5 text-[11px] text-secondary-token'>
            {eventDate ? (
              <span className='inline-flex items-center gap-1 rounded-md bg-surface-1 px-1.5 py-1'>
                <Calendar className='h-3 w-3 text-tertiary-token' />
                {eventDate}
              </span>
            ) : null}
            {event.status ? (
              <span className='rounded-md bg-surface-1 px-1.5 py-1'>
                {event.status}
              </span>
            ) : null}
            {event.provider ? (
              <span className='rounded-md bg-surface-1 px-1.5 py-1'>
                {event.provider}
              </span>
            ) : null}
          </div>
          {event.subtitle ? (
            <p className='text-[12px] text-secondary-token'>{event.subtitle}</p>
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
  profileContext,
  threadTitle,
}: Readonly<ChatEntityRightPanelHostProps>) {
  const { isOpen: isPreviewPanelOpen } = usePreviewPanelState();
  const { target, contextTargets, close, dismissContext } =
    useChatEntityPanel();

  const panel = useMemo(() => {
    const contextCards =
      enableChatEntityPanels && profileId && contextTargets.length > 0 ? (
        <ChatRailContextCards
          targets={contextTargets}
          profileContext={profileContext}
          onDismiss={dismissContext}
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

    if (contextCards && entityPanel) {
      return (
        <aside
          className={cn(CHAT_ENTITY_RIGHT_PANEL_SHELL_CLASSNAME, 'flex-col')}
          data-testid='chat-rail-context-and-entity-panel'
        >
          <div className='shrink-0 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_64%,transparent)]'>
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

    if (!enablePreviewPanel || !isPreviewPanelOpen) {
      return null;
    }

    return (
      <ErrorBoundary fallback={null}>
        <ProfileContactSidebar />
      </ErrorBoundary>
    );
  }, [
    close,
    contextTargets,
    dismissContext,
    enableChatEntityPanels,
    enablePreviewPanel,
    isPreviewPanelOpen,
    profileId,
    profileContext,
    target,
    threadTitle,
  ]);

  useRegisterRightPanel(panel);

  return null;
}
