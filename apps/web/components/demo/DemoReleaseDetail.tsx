'use client';

import { MessageSquare, Paperclip, SendHorizontal, X } from 'lucide-react';
import {
  DrawerButton,
  DrawerInlineIconButton,
  DrawerPropertyRow,
  DrawerSectionHeading,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { DemoAvatar } from './DemoAvatar';
import { DemoPriorityIcon } from './DemoPriorityIcon';
import { DemoStatusIcon } from './DemoStatusIcon';
import { runDemoAction } from './demo-actions';
import { DEMO_ACTIVITY_TEMPLATE } from './demo-fixtures';
import type { DemoRelease } from './demo-types';

interface DemoReleaseDetailProps {
  readonly release: DemoRelease;
  readonly onClose: () => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  Spotify: '#1DB954',
  'Apple Music': '#FA2D48',
  'YouTube Music': '#FF0000',
  'Amazon Music': '#00A8E1',
  SoundCloud: '#FF5500',
};

const STATUS_DOT: Record<string, string> = {
  connected: 'var(--color-success)',
  missing: 'var(--linear-text-tertiary)',
  stale: 'var(--color-warning)',
};

export function DemoReleaseDetail({
  release,
  onClose,
}: DemoReleaseDetailProps) {
  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex min-h-10 items-center justify-between border-b border-(--linear-app-frame-seam) px-4 py-2'>
        <div className='min-w-0 flex-1 text-[13px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary)'>
          REL-{release.id.slice(0, 4).toUpperCase()}
        </div>
        <DrawerInlineIconButton
          onClick={onClose}
          className='size-7 rounded-[7px]'
          aria-label='Close detail panel'
        >
          <X className='size-4' />
        </DrawerInlineIconButton>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-5'>
        {/* Title Area */}
        <div className='mb-6'>
          <h2 className='mb-1 text-lg font-semibold text-(--linear-text-primary)'>
            {release.title}
          </h2>
          <p className='text-[13px] text-(--linear-text-secondary)'>
            {release.artist}
          </p>
        </div>

        {/* Properties grid */}
        <div className='mb-8 space-y-1'>
          <DemoPropertyRow label='Status'>
            <div className='-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <DemoStatusIcon status={release.status} />
              <span className='capitalize'>{release.status}</span>
            </div>
          </DemoPropertyRow>
          <DemoPropertyRow label='Priority'>
            <div className='-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <DemoPriorityIcon priority={release.priority} />
              <span className='capitalize'>{release.priority}</span>
            </div>
          </DemoPropertyRow>
          <DemoPropertyRow label='Assignee'>
            <div className='-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <DemoAvatar assignee={release.assignee} size={16} />
              <span>{release.assignee.name}</span>
            </div>
          </DemoPropertyRow>
          <DemoPropertyRow label='Type'>
            <div className='-ml-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <span>{release.type}</span>
            </div>
          </DemoPropertyRow>
          <DemoPropertyRow label='Tracks'>
            <div className='-ml-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <span>{release.trackCount}</span>
            </div>
          </DemoPropertyRow>
          <DemoPropertyRow label='Release date'>
            <div className='-ml-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-1)'>
              <span>{release.releaseDate}</span>
            </div>
          </DemoPropertyRow>
        </div>

        {/* Provider connections */}
        {release.links.length > 0 && (
          <div className='mt-4 mb-8'>
            <DrawerSectionHeading className='mb-2'>
              Providers
            </DrawerSectionHeading>
            <div className='space-y-1'>
              {release.links.map(link => (
                <DrawerSurfaceCard
                  key={link.id}
                  className='flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px]'
                >
                  <span
                    className='size-1.5 shrink-0 rounded-full'
                    style={{ backgroundColor: STATUS_DOT[link.status] }}
                  />
                  <span
                    className='flex-1 font-medium'
                    style={{
                      color:
                        PROVIDER_COLORS[link.provider] ??
                        'var(--linear-text-primary)',
                    }}
                  >
                    {link.provider}
                  </span>
                  <span className='capitalize text-(--linear-text-tertiary)'>
                    {link.status}
                  </span>
                </DrawerSurfaceCard>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {release.labels.length > 0 && (
          <div className='mt-4 mb-8'>
            <DrawerSectionHeading className='mb-2'>Labels</DrawerSectionHeading>
            <div className='flex flex-wrap gap-1'>
              {release.labels.map(label => (
                <span
                  key={label.id}
                  className='flex items-center gap-1.5 rounded-[6px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-1.5 py-0.5 text-[10px] font-[510] text-(--linear-text-secondary)'
                >
                  <span
                    className='size-1.5 rounded-full'
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Activity */}
        <div className='mt-4'>
          <DrawerSectionHeading className='mb-3'>Activity</DrawerSectionHeading>
          <DrawerSurfaceCard className='space-y-0.5 border-(--linear-border-subtle)/70 bg-(--linear-bg-surface-1)/40 p-3'>
            {DEMO_ACTIVITY_TEMPLATE.map((activity, index) => (
              <div
                key={activity.id}
                className='relative flex items-start gap-3 rounded-[7px] py-1.5 pr-1 transition-colors duration-150 hover:bg-(--linear-bg-surface-0)/60'
              >
                {index < DEMO_ACTIVITY_TEMPLATE.length - 1 ? (
                  <div
                    aria-hidden='true'
                    className='absolute bottom-0 left-3 top-0 w-px bg-(--linear-border-subtle)/75'
                  />
                ) : null}
                <div className='relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--linear-border-subtle)/80 bg-(--linear-bg-surface-0) shadow-[0_0_0_2px_var(--linear-bg-surface-1)]'>
                  <div className='size-1 rounded-full bg-(--linear-text-tertiary)' />
                </div>
                <div className='min-w-0 flex-1 leading-snug text-(--linear-text-secondary)'>
                  <div className='text-[12.5px] tracking-[-0.005em]'>
                    <span className='font-[500] text-(--linear-text-secondary)'>
                      {activity.action}
                    </span>
                    {activity.detail ? (
                      <span className='text-(--linear-text-tertiary)/95'>
                        {' '}
                        - {activity.detail}
                      </span>
                    ) : null}
                  </div>
                  <div className='mt-0.5 text-[10.5px] text-(--linear-text-tertiary)'>
                    {activity.time}
                  </div>
                </div>
              </div>
            ))}
          </DrawerSurfaceCard>
        </div>

        <div className='mt-5'>
          <DrawerSectionHeading className='mb-2'>Comments</DrawerSectionHeading>
          <DrawerSurfaceCard className='border-(--linear-border-subtle)/80 bg-(--linear-bg-surface-1)/35 p-2.5'>
            <div className='rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2.5 py-2'>
              <label htmlFor='release-comment' className='sr-only'>
                Add comment
              </label>
              <textarea
                id='release-comment'
                rows={3}
                readOnly
                value='Leave a note for your team. Comments in demo mode stay local.'
                className='w-full resize-none bg-transparent text-[12.5px] leading-[1.45] text-(--linear-text-secondary) outline-none placeholder:text-(--linear-text-tertiary)'
              />
              <div className='mt-2 flex items-center justify-between border-t border-(--linear-border-subtle)/80 pt-2'>
                <div className='inline-flex items-center gap-1.5 text-[11px] text-(--linear-text-tertiary)'>
                  <MessageSquare className='size-3.5' aria-hidden />
                  <span>Internal update</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <DrawerInlineIconButton
                    className='size-7 rounded-[7px] text-(--linear-text-tertiary)'
                    aria-label='Attach file'
                  >
                    <Paperclip className='size-3.5' />
                  </DrawerInlineIconButton>
                  <DrawerButton
                    size='icon'
                    tone='secondary'
                    className='h-7 w-7 rounded-[7px]'
                    aria-label='Send comment'
                    onClick={() =>
                      runDemoAction({
                        loadingMessage: 'Posting comment',
                        successMessage:
                          'Comment queued in demo mode. Nothing was sent.',
                      })
                    }
                  >
                    <SendHorizontal className='size-3.5' />
                  </DrawerButton>
                </div>
              </div>
            </div>
          </DrawerSurfaceCard>
        </div>

        {/* Note */}
        {release.note && (
          <div className='mt-4 mb-4'>
            <DrawerSectionHeading className='mb-2'>Note</DrawerSectionHeading>
            <DrawerSurfaceCard className='p-3'>
              <p className='text-[13px] text-(--linear-text-secondary)'>
                {release.note}
              </p>
            </DrawerSurfaceCard>
          </div>
        )}

        {/* Actions */}
        <div className='mt-8 grid grid-cols-2 gap-2 border-t border-(--linear-app-frame-seam) pt-3'>
          <DrawerButton
            tone='secondary'
            className='justify-center border-(--linear-border-subtle)/80 bg-transparent text-(--linear-text-tertiary) hover:text-(--linear-text-secondary)'
            onClick={() =>
              runDemoAction({
                loadingMessage: 'Syncing providers',
                successMessage: 'Sync complete. Demo data stays local.',
              })
            }
          >
            Sync
          </DrawerButton>
          <DrawerButton
            tone='secondary'
            className='justify-center border-(--linear-border-subtle)/80 bg-transparent text-(--linear-text-tertiary) hover:text-(--linear-text-secondary)'
            onClick={() =>
              runDemoAction({
                loadingMessage: 'Publishing release',
                successMessage: 'Published in demo mode. No changes made.',
              })
            }
          >
            Publish
          </DrawerButton>
        </div>
      </div>
    </div>
  );
}

function DemoPropertyRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <DrawerPropertyRow
      label={label}
      value={
        <div className='flex items-center text-(--linear-text-primary)'>
          {children}
        </div>
      }
      labelWidth={100}
      size='md'
      align='center'
      valueClassName='text-(--linear-text-primary)'
    />
  );
}
