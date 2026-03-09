'use client';

import { Button } from '@jovie/ui';
import { X } from 'lucide-react';
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
  missing: 'var(--color-text-quaternary-token)',
  stale: 'var(--color-warning)',
};

export function DemoReleaseDetail({
  release,
  onClose,
}: DemoReleaseDetailProps) {
  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between border-b border-subtle px-4 py-2 min-h-12'>
        <div className='min-w-0 flex-1 text-[13px] text-tertiary-token font-medium'>
          REL-{release.id.slice(0, 4).toUpperCase()}
        </div>
        <button
          type='button'
          onClick={onClose}
          className='shrink-0 rounded flex items-center justify-center size-6 text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-primary-token'
          aria-label='Close detail panel'
        >
          <X className='size-4' />
        </button>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-5'>
        {/* Title Area */}
        <div className='mb-6'>
          <h2 className='text-lg font-semibold text-primary-token mb-1'>
            {release.title}
          </h2>
          <p className='text-[13px] text-secondary-token'>{release.artist}</p>
        </div>

        {/* Properties grid */}
        <div className='space-y-1 mb-8'>
          <PropertyRow label='Status'>
            <div className='flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <DemoStatusIcon status={release.status} />
              <span className='capitalize'>{release.status}</span>
            </div>
          </PropertyRow>
          <PropertyRow label='Priority'>
            <div className='flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <DemoPriorityIcon priority={release.priority} />
              <span className='capitalize'>{release.priority}</span>
            </div>
          </PropertyRow>
          <PropertyRow label='Assignee'>
            <div className='flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <DemoAvatar assignee={release.assignee} size={16} />
              <span>{release.assignee.name}</span>
            </div>
          </PropertyRow>
          <PropertyRow label='Type'>
            <div className='px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <span>{release.type}</span>
            </div>
          </PropertyRow>
          <PropertyRow label='Tracks'>
            <div className='px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <span>{release.trackCount}</span>
            </div>
          </PropertyRow>
          <PropertyRow label='Release date'>
            <div className='px-2 py-1 -ml-2 rounded-md hover:bg-interactive-hover transition-colors duration-normal'>
              <span>{release.releaseDate}</span>
            </div>
          </PropertyRow>
        </div>

        {/* Provider connections */}
        {release.links.length > 0 && (
          <div className='mt-4 mb-8'>
            <h3 className='text-2xs uppercase tracking-wider text-tertiary-token mb-2 [font-weight:var(--font-weight-medium)]'>
              Providers
            </h3>
            <div className='space-y-1'>
              {release.links.map(link => (
                <div
                  key={link.id}
                  className='flex items-center gap-2 rounded-md border border-subtle px-3 py-2 text-[13px]'
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
                        'var(--color-text-primary-token)',
                    }}
                  >
                    {link.provider}
                  </span>
                  <span className='capitalize text-tertiary-token'>
                    {link.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Labels */}
        {release.labels.length > 0 && (
          <div className='mt-4 mb-8'>
            <h3 className='text-2xs uppercase tracking-wider text-tertiary-token mb-2 [font-weight:var(--font-weight-medium)]'>
              Labels
            </h3>
            <div className='flex flex-wrap gap-1'>
              {release.labels.map(label => (
                <span
                  key={label.id}
                  className='flex items-center gap-1.5 rounded-[2px] border border-subtle bg-interactive-hover px-1.5 py-0.5 text-[10px] text-secondary-token [font-weight:var(--font-weight-medium)]'
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
        <div className='mt-4 space-y-2'>
          <h3 className='text-2xs uppercase tracking-wider text-tertiary-token mb-3 [font-weight:var(--font-weight-medium)]'>
            Activity
          </h3>
          <div className='space-y-3'>
            {DEMO_ACTIVITY_TEMPLATE.map(activity => (
              <div key={activity.id} className='flex gap-2.5 text-[13px]'>
                <div className='mt-1 size-2 shrink-0 rounded-full bg-tertiary-token' />
                <div className='text-secondary-token leading-snug'>
                  <span className='font-medium text-primary-token'>
                    {activity.action}
                  </span>
                  {activity.detail && (
                    <span className='text-tertiary-token'>
                      {' '}
                      &mdash; {activity.detail}
                    </span>
                  )}
                  <span className='text-tertiary-token'>
                    {' '}
                    · {activity.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        {release.note && (
          <div className='mt-4 mb-4'>
            <h3 className='text-2xs uppercase tracking-wider text-tertiary-token mb-2 [font-weight:var(--font-weight-medium)]'>
              Note
            </h3>
            <p className='text-[13px] text-secondary-token'>{release.note}</p>
          </div>
        )}

        {/* Actions */}
        <div className='mt-8 grid grid-cols-2 gap-2'>
          <Button
            size='sm'
            variant='secondary'
            onClick={() =>
              runDemoAction({
                loadingMessage: 'Syncing providers',
                successMessage: 'Sync complete. Demo data stays local.',
              })
            }
          >
            Sync
          </Button>
          <Button
            size='sm'
            variant='secondary'
            onClick={() =>
              runDemoAction({
                loadingMessage: 'Publishing release',
                successMessage: 'Published in demo mode. No changes made.',
              })
            }
          >
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Helper ──

function PropertyRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex items-center text-[13px] min-h-[28px]'>
      <span className='w-[100px] shrink-0 text-tertiary-token'>{label}</span>
      <div className='flex-1 text-primary-token flex items-center'>
        {children}
      </div>
    </div>
  );
}
