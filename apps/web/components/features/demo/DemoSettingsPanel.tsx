'use client';

import { Button } from '@jovie/ui';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { runDemoAction } from './demo-actions';

const PLATFORM_CONNECTIONS = [
  { name: 'Spotify', connected: true, color: '#1DB954' },
  { name: 'Apple Music', connected: true, color: '#FA2D48' },
  { name: 'YouTube Music', connected: true, color: '#FF0000' },
  { name: 'Amazon Music', connected: false, color: '#00A8E1' },
  { name: 'SoundCloud', connected: false, color: '#FF5500' },
  { name: 'Tidal', connected: false, color: '#000000' },
];

export function DemoSettingsPanel() {
  return (
    <div className='h-full overflow-y-auto p-3'>
      <div className='space-y-3'>
        <ContentSurfaceCard className='overflow-hidden p-0'>
          <ContentSectionHeader
            title='Artist Profile'
            subtitle='Core public-facing identity fields for your artist page.'
            className='px-4 py-3'
          />
          <div className='space-y-3 px-4 py-3'>
            <SettingsRow label='Name' value='Sora Vale' />
            <SettingsRow
              label='Bio'
              value='Indie electronic artist from Portland, OR. Creating sounds between ambient and synthwave.'
            />
            <SettingsRow
              label='Genres'
              value='Indie Electronic, Synthwave, Ambient'
            />
            <SettingsRow label='Handle' value='@soravale' />
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='overflow-hidden p-0'>
          <ContentSectionHeader
            title='Platform Connections'
            subtitle='Link and maintain the streaming services tied to this profile.'
            className='px-4 py-3'
          />
          <div className='space-y-2 px-4 py-3'>
            {PLATFORM_CONNECTIONS.map(platform => (
              <ContentSurfaceCard
                key={platform.name}
                className='flex items-center justify-between border-0 shadow-none px-2.5 py-2'
              >
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className='size-2 shrink-0 rounded-full'
                    style={{
                      backgroundColor: platform.connected
                        ? 'var(--color-success)'
                        : 'var(--linear-text-quaternary)',
                    }}
                  />
                  <span
                    className='truncate text-[13px] font-[510]'
                    style={{ color: platform.color }}
                  >
                    {platform.name}
                  </span>
                </div>
                <Button
                  size='sm'
                  variant='secondary'
                  onClick={() =>
                    runDemoAction({
                      successMessage: platform.connected
                        ? `${platform.name} reconnected (demo).`
                        : `${platform.name} connected (demo).`,
                    })
                  }
                >
                  {platform.connected ? 'Reconnect' : 'Connect'}
                </Button>
              </ContentSurfaceCard>
            ))}
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='overflow-hidden p-0'>
          <ContentSectionHeader
            title='Preferences'
            subtitle='Choose how the demo profile behaves and notifies you.'
            className='px-4 py-3'
          />
          <div className='space-y-3 px-4 py-3'>
            <ToggleRow
              label='Auto-sync new releases'
              description='Automatically create smart links when new releases are detected'
              defaultChecked
            />
            <ToggleRow
              label='Email notifications'
              description='Get notified when platforms sync or require attention'
              defaultChecked
            />
            <ToggleRow
              label='Public profile'
              description='Allow your artist page to be discoverable'
              defaultChecked={false}
            />
          </div>
        </ContentSurfaceCard>
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className='flex items-start justify-between gap-4 text-[13px]'>
      <span className='shrink-0 text-tertiary-token'>{label}</span>
      <span className='text-right text-primary-token'>{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  defaultChecked,
}: {
  readonly label: string;
  readonly description: string;
  readonly defaultChecked: boolean;
}) {
  return (
    <label
      aria-label={label}
      className='flex cursor-pointer items-start justify-between gap-3 rounded-md bg-surface-0 px-2.5 py-2'
    >
      <div>
        <p className='text-[13px] font-[510] text-primary-token'>{label}</p>
        <p className='text-[12px] text-tertiary-token'>{description}</p>
      </div>
      <input
        type='checkbox'
        defaultChecked={defaultChecked}
        className='mt-0.5 size-4 shrink-0 rounded-sm accent-[var(--color-accent)]'
        onChange={() =>
          runDemoAction({ successMessage: `Setting updated (demo).` })
        }
      />
    </label>
  );
}
