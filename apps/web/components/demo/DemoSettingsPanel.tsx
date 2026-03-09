'use client';

import { Button } from '@jovie/ui';
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
    <div className='h-full overflow-y-auto'>
      {/* Profile section */}
      <div className='border-b border-subtle p-4'>
        <h3 className='mb-3 text-2xs uppercase tracking-wider text-tertiary-token [font-weight:var(--font-weight-medium)]'>
          Artist Profile
        </h3>
        <div className='space-y-3'>
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
      </div>

      {/* Platform connections */}
      <div className='border-b border-subtle p-4'>
        <h3 className='mb-3 text-2xs uppercase tracking-wider text-tertiary-token [font-weight:var(--font-weight-medium)]'>
          Platform Connections
        </h3>
        <div className='space-y-2'>
          {PLATFORM_CONNECTIONS.map(platform => (
            <div
              key={platform.name}
              className='flex items-center justify-between rounded-md border border-subtle px-3 py-2 text-app'
            >
              <div className='flex items-center gap-2'>
                <span
                  className='size-2 shrink-0 rounded-full'
                  style={{
                    backgroundColor: platform.connected
                      ? 'var(--color-success)'
                      : 'var(--color-text-quaternary-token)',
                  }}
                />
                <span className='font-medium' style={{ color: platform.color }}>
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
            </div>
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div className='p-4'>
        <h3 className='mb-3 text-2xs uppercase tracking-wider text-tertiary-token [font-weight:var(--font-weight-medium)]'>
          Preferences
        </h3>
        <div className='space-y-3'>
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
    <div className='flex items-start justify-between gap-4 text-app'>
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
      className='flex cursor-pointer items-start justify-between gap-3 rounded-md border border-subtle px-3 py-2.5'
    >
      <div>
        <p className='text-app font-medium text-primary-token'>{label}</p>
        <p className='text-2xs text-tertiary-token'>{description}</p>
      </div>
      <input
        type='checkbox'
        defaultChecked={defaultChecked}
        className='mt-0.5 size-4 shrink-0 accent-[var(--color-accent)] rounded'
        onChange={() =>
          runDemoAction({ successMessage: `Setting updated (demo).` })
        }
      />
    </label>
  );
}
