'use client';

import { Button } from '@jovie/ui';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { cn } from '@/lib/utils';
import { runDemoAction } from './demo-actions';

const PLATFORM_CONNECTIONS = [
  { name: 'Spotify', connected: true, color: '#1DB954' },
  { name: 'Apple Music', connected: true, color: '#FA2D48' },
  { name: 'YouTube Music', connected: true, color: '#FF0000' },
  { name: 'Amazon Music', connected: false, color: '#00A8E1' },
  { name: 'SoundCloud', connected: false, color: '#FF5500' },
  { name: 'Tidal', connected: false, color: '#000000' },
] as const;

type DemoSettingsCaptureMode = 'quality' | 'sync' | null;

function isDemoSettingsCaptureMode(
  value: string | null
): value is Exclude<DemoSettingsCaptureMode, null> {
  return value === 'quality' || value === 'sync';
}

export function DemoSettingsPanel() {
  const searchParams = useSearchParams();
  const profile = INTERNAL_DJ_DEMO_PERSONA.profile;
  const requestedCaptureMode = searchParams.get('capture');
  const captureMode: DemoSettingsCaptureMode = isDemoSettingsCaptureMode(
    requestedCaptureMode
  )
    ? requestedCaptureMode
    : null;

  if (captureMode === 'quality') {
    return <AudienceQualityCaptureCard />;
  }

  if (captureMode === 'sync') {
    return <SyncSettingsCaptureCard />;
  }

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
                    className='truncate text-app font-caption'
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
              label='Automatic New Releases'
              description='Automatically create smart links when new releases are detected'
              defaultChecked
            />
            <ToggleRow
              label='Email Notifications'
              description='Get notified when platforms sync or require attention'
              defaultChecked
            />
            <ToggleRow
              label='Public Profile'
              description='Allow your artist page to be discoverable'
              defaultChecked={false}
            />
          </div>
        </SettingsSection>
      </ContentSurfaceCard>
    </div>
  );
}

function AudienceQualityCaptureCard() {
  return (
    <div className='mx-auto max-w-220 px-4 py-4 sm:px-5 sm:py-5'>
      <div
        className='overflow-hidden rounded-3xl border border-subtle bg-surface-0 shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
        data-testid='demo-settings-audience-quality-capture'
      >
        <div className='border-b border-subtle px-5 py-4'>
          <p className='text-2xs font-semibold tracking-[0.12em] text-tertiary-token uppercase'>
            Settings
          </p>
          <div className='mt-2 flex items-end justify-between gap-4'>
            <div>
              <h2 className='text-xl font-semibold tracking-[-0.03em] text-primary-token'>
                Audience Quality Filtering
              </h2>
              <p className='mt-1 max-w-[34rem] text-app leading-[1.55] text-secondary-token'>
                Keep the audience view focused on real intent by filtering junk
                traffic, repeat self-visits, and low-signal activity.
              </p>
            </div>
            <span className='rounded-full border border-[color:color-mix(in_srgb,var(--color-success)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--color-success)_16%,transparent)] px-3 py-1 text-xs font-semibold text-primary-token'>
              Active
            </span>
          </div>
        </div>

        <div className='grid gap-0 border-t border-subtle md:grid-cols-[minmax(0,0.92fr)_minmax(18rem,0.78fr)]'>
          <div className='border-b border-subtle p-5 md:border-b-0 md:border-r'>
            <div className='space-y-3'>
              <QualitySignalRow
                label='Filter Self Visits'
                detail='Hide your own scans, test taps, and internal traffic.'
                value='On'
                tone='success'
              />
              <QualitySignalRow
                label='Filter Low Signal'
                detail='Suppress anonymous taps with weak downstream intent.'
                value='On'
                tone='success'
              />
              <QualitySignalRow
                label='Filter Junk Traffic'
                detail='Catch suspicious spikes, repeat loops, and broken crawlers.'
                value='Auto'
                tone='neutral'
              />
            </div>
          </div>

          <div className='p-5'>
            <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <p className='text-app font-semibold text-primary-token'>
                    Advanced Quality Filtering
                  </p>
                  <p className='mt-1 text-xs leading-normal text-secondary-token'>
                    Apply the same quality logic across audience views, exports,
                    and downstream automations.
                  </p>
                </div>
                <AlwaysInSyncToggle />
              </div>

              <div className='mt-4 space-y-2'>
                <FilterRule label='Merch Table Scans' value='Trusted source' />
                <FilterRule
                  label='Profile Revisit Within Twenty Minutes'
                  value='Collapsed'
                />
                <FilterRule label='Anonymous Bounce' value='Excluded' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyncSettingsCaptureCard() {
  return (
    <div className='mx-auto max-w-190 px-4 py-4 sm:px-5 sm:py-5'>
      <div
        className='overflow-hidden rounded-3xl border border-subtle bg-surface-0 shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
        data-testid='demo-settings-sync-capture'
      >
        <div className='border-b border-subtle px-5 py-4'>
          <p className='text-2xs font-semibold tracking-[0.12em] text-tertiary-token uppercase'>
            Settings
          </p>
          <h2 className='mt-2 text-xl font-semibold tracking-[-0.03em] text-primary-token'>
            Always In Sync
          </h2>
          <p className='mt-1 max-w-[34rem] text-app leading-[1.55] text-secondary-token'>
            Keep new music and profile surfaces current automatically, without
            republishing your page every time something changes.
          </p>
        </div>

        <div className='space-y-3 p-5'>
          <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
            <div className='flex items-start justify-between gap-4'>
              <div>
                <p className='text-app font-semibold text-primary-token'>
                  Always in sync
                </p>
                <p className='mt-1 text-xs leading-normal text-secondary-token'>
                  New releases, top tracks, and linked surfaces stay aligned.
                </p>
              </div>
              <AlwaysInSyncToggle />
            </div>
          </div>

          <div className='grid gap-2 sm:grid-cols-3'>
            <SyncSurfacePill label='Latest Release' value='Live' />
            <SyncSurfacePill label='Top Tracks' value='Auto' />
            <SyncSurfacePill label='Profile Pages' value='Updated' />
          </div>

          <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
            <p className='text-xs font-semibold text-secondary-token'>
              Connected surfaces
            </p>
            <div className='mt-3 space-y-2'>
              {[
                'Artist profile',
                'Smart links',
                'Release pages',
                'Sound pages',
              ].map(label => (
                <div
                  key={label}
                  className='flex items-center justify-between rounded-xl bg-surface-0 px-3 py-2 text-xs'
                >
                  <span className='font-caption text-primary-token'>
                    {label}
                  </span>
                  <span className='text-secondary-token'>
                    Updated automatically
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlwaysInSyncToggle() {
  return (
    <div className='inline-flex items-center gap-3'>
      <span className='text-xs font-semibold text-primary-token'>
        Always In Sync
      </span>
      <span className='flex h-7 w-12 items-center rounded-full bg-accent px-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'>
        <span className='ml-auto h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.22)] dark:bg-white' />
      </span>
    </div>
  );
}

function QualitySignalRow({
  label,
  detail,
  value,
  tone,
}: Readonly<{
  label: string;
  detail: string;
  value: string;
  tone: 'success' | 'neutral';
}>) {
  return (
    <div className='rounded-2xl border border-subtle bg-surface-1 p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-app font-semibold text-primary-token'>{label}</p>
          <p className='mt-1 text-xs leading-normal text-secondary-token'>
            {detail}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-2xs font-semibold',
            tone === 'success'
              ? 'bg-[color:color-mix(in_srgb,var(--color-success)_18%,transparent)] text-primary-token'
              : 'bg-surface-0 text-secondary-token'
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function FilterRule({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className='flex items-center justify-between rounded-xl bg-surface-0 px-3 py-2 text-xs'>
      <span className='font-caption text-primary-token'>{label}</span>
      <span className='text-secondary-token'>{value}</span>
    </div>
  );
}

function SyncSurfacePill({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className='rounded-2xl border border-subtle bg-surface-1 px-3 py-3'>
      <p className='text-2xs font-semibold tracking-tight text-secondary-token'>
        {label}
      </p>
      <p className='mt-1 text-sm font-semibold text-primary-token'>{value}</p>
    </div>
  );
}

function SettingsSection({
  title,
  children,
  bordered = false,
}: Readonly<{
  title: string;
  children: ReactNode;
  bordered?: boolean;
}>) {
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
}: Readonly<{
  label: string;
  value: string;
}>) {
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
}: Readonly<{
  label: string;
  description: string;
  defaultChecked: boolean;
}>) {
  return (
    <label
      aria-label={label}
      className='flex cursor-pointer items-start justify-between gap-3 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] py-2.5 last:border-b-0'
    >
      <div>
        <p className='text-app font-caption text-primary-token'>{label}</p>
        <p className='text-xs text-tertiary-token'>{description}</p>
      </div>
      <input
        type='checkbox'
        defaultChecked={defaultChecked}
        className='mt-0.5 size-4 shrink-0 rounded-sm accent-(--color-accent)'
        onChange={() =>
          runDemoAction({ successMessage: 'Setting updated (demo).' })
        }
      />
    </label>
  );
}
