'use client';

import { Button } from '@jovie/ui';
import {
  Calendar,
  Disc3,
  ImageIcon,
  Link as LinkIcon,
  MessageSquareText,
  Music2,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { type ReactNode, useMemo } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ErrorBoundary } from '@/components/providers/ErrorBoundary';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useReleaseEntityQuery } from '@/lib/queries/useReleaseEntityQuery';
import { cn } from '@/lib/utils';
import {
  type ChatEntityTarget,
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
  readonly threadTitle?: string | null;
}

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
  const releaseDate = formatReleaseDate(release?.releaseDate);
  const visibleProviders = release?.providers.filter(provider => provider.url);
  const hasMedia =
    Boolean(release?.artworkUrl) ||
    Boolean(release?.previewUrl) ||
    Boolean(visibleProviders && visibleProviders.length > 0);

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
        <div className='flex flex-1 items-center justify-center px-6 text-center text-[13px] text-tertiary-token'>
          Loading release…
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

export function ChatEntityRightPanelHost({
  enablePreviewPanel,
  enableChatEntityPanels = false,
  profileId,
  threadTitle,
}: Readonly<ChatEntityRightPanelHostProps>) {
  const { isOpen: isPreviewPanelOpen } = usePreviewPanelState();
  const { target, close } = useChatEntityPanel();

  const panel = useMemo(() => {
    if (enableChatEntityPanels && target?.kind === 'release') {
      return profileId ? (
        <ChatReleaseEntityPanelLoader
          target={target}
          profileId={profileId}
          threadTitle={threadTitle}
          onClose={close}
        />
      ) : null;
    }

    if (target) {
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
    enableChatEntityPanels,
    enablePreviewPanel,
    isPreviewPanelOpen,
    profileId,
    target,
    threadTitle,
  ]);

  useRegisterRightPanel(panel);

  return null;
}
