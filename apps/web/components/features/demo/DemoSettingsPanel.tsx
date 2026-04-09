'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
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
  const profile = INTERNAL_DJ_DEMO_PERSONA.profile;
  return (
    <div className='h-full overflow-y-auto'>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <SettingsSection title='Artist Profile'>
          <div className='space-y-3 px-4 py-3'>
            <SettingsRow label='Name' value={profile.displayName} />
            <SettingsRow label='Bio' value={profile.bio} />
            <SettingsRow label='Genres' value={profile.genres.join(', ')} />
            <SettingsRow label='Handle' value={`@${profile.handle}`} />
          </div>
        </SettingsSection>

        <SettingsSection title='Platform Connections' bordered>
          <div className='px-4 py-3'>
            {PLATFORM_CONNECTIONS.map(platform => (
              <div
                key={platform.name}
                className='flex items-center justify-between gap-4 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-2 py-2.5 last:border-b-0'
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
                  className='rounded-full'
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
        </SettingsSection>

        <SettingsSection title='Preferences' bordered>
          <div className='px-4 py-3'>
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
        </SettingsSection>
      </ContentSurfaceCard>
    </div>
  );
}

function SettingsSection({
  title,
  children,
  bordered = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly bordered?: boolean;
}) {
  return (
    <section
      className={
        bordered
          ? 'border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)]'
          : ''
      }
    >
      <ContentSectionHeader
        title={title}
        variant='plain'
        className='px-4 py-3'
      />
      {children}
    </section>
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
      className='flex cursor-pointer items-start justify-between gap-3 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] py-2.5 last:border-b-0'
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
