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
      <div className='flex items-start justify-between border-b border-subtle px-4 py-3'>
        <div className='min-w-0 flex-1'>
          <h2 className='truncate text-sm font-semibold text-primary-token'>
            {release.title}
          </h2>
          <p className='text-2xs text-tertiary-token'>{release.artist}</p>
        </div>
        <button
          type='button'
          onClick={onClose}
          className='shrink-0 rounded-md p-1 text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-primary-token'
          aria-label='Close detail panel'
        >
          <X className='size-4' />
        </button>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4'>
        {/* Properties grid */}
        <div className='space-y-3'>
          <h3 className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
            Properties
          </h3>
          <div className='space-y-2'>
            <PropertyRow label='Status'>
              <div className='flex items-center gap-1.5'>
                <DemoStatusIcon status={release.status} />
                <span className='capitalize'>{release.status}</span>
              </div>
            </PropertyRow>
            <PropertyRow label='Priority'>
              <div className='flex items-center gap-1.5'>
                <DemoPriorityIcon priority={release.priority} />
                <span className='capitalize'>{release.priority}</span>
              </div>
            </PropertyRow>
            <PropertyRow label='Type'>
              <span>{release.type}</span>
            </PropertyRow>
            <PropertyRow label='Tracks'>
              <span>{release.trackCount}</span>
            </PropertyRow>
            <PropertyRow label='Release date'>
              <span>{release.releaseDate}</span>
            </PropertyRow>
            <PropertyRow label='Assignee'>
              <div className='flex items-center gap-1.5'>
                <DemoAvatar assignee={release.assignee} size={16} />
                <span>{release.assignee.name}</span>
              </div>
            </PropertyRow>
            {release.streams > 0 && (
              <PropertyRow label='Streams'>
                <span>{release.streams.toLocaleString()}</span>
              </PropertyRow>
            )}
          </div>
        </div>

        {/* Labels */}
        {release.labels.length > 0 && (
          <div className='mt-4 space-y-2'>
            <h3 className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
              Labels
            </h3>
            <div className='flex flex-wrap gap-1'>
              {release.labels.map(label => (
                <span
                  key={label.id}
                  className='rounded-xs px-1.5 py-0.5 text-[10px] font-medium'
                  style={{
                    backgroundColor: `${label.color}20`,
                    color: label.color,
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Provider connections */}
        {release.links.length > 0 && (
          <div className='mt-4 space-y-2'>
            <h3 className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
              Providers
            </h3>
            <div className='space-y-1.5'>
              {release.links.map(link => (
                <div
                  key={link.id}
                  className='flex items-center gap-2 rounded-md border border-subtle px-3 py-2'
                >
                  <span
                    className='size-2 shrink-0 rounded-full'
                    style={{ backgroundColor: STATUS_DOT[link.status] }}
                  />
                  <span
                    className='flex-1 text-app font-medium'
                    style={{
                      color:
                        PROVIDER_COLORS[link.provider] ??
                        'var(--color-text-primary-token)',
                    }}
                  >
                    {link.provider}
                  </span>
                  <span className='text-2xs capitalize text-tertiary-token'>
                    {link.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity */}
        <div className='mt-4 space-y-2'>
          <h3 className='text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
            Activity
          </h3>
          <div className='space-y-2'>
            {DEMO_ACTIVITY_TEMPLATE.map(activity => (
              <div key={activity.id} className='flex gap-2'>
                <div className='mt-1.5 size-1.5 shrink-0 rounded-full bg-tertiary-token' />
                <div>
                  <p className='text-app text-primary-token'>
                    {activity.action}
                  </p>
                  <p className='text-2xs text-tertiary-token'>
                    {activity.detail} · {activity.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className='mt-5 grid grid-cols-2 gap-2'>
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

      {/* Note */}
      {release.note && (
        <div className='border-t border-subtle px-4 py-3'>
          <p className='text-2xs text-tertiary-token'>{release.note}</p>
        </div>
      )}
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
    <div className='flex items-center justify-between text-app'>
      <span className='text-tertiary-token'>{label}</span>
      <div className='text-primary-token'>{children}</div>
    </div>
  );
}
