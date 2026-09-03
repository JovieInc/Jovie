'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/OvieLauncherRail.test.tsx

import { Button, Input } from '@jovie/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { launchOperatorControl } from '@/lib/desktop/electron-bridge';
import {
  filterLaunchers,
  type OvieLauncherControl,
  type OvieLauncherGroup,
  type OvieLauncherInventory,
  type OvieLauncherStatus,
} from '@/lib/hud/ovie-launchers';

const FETCH_URL = '/api/admin/hud/ovie-launchers';
const FETCH_TIMEOUT_MS = 8_000;

// biome-ignore format: compact status copy
const STATUS_LABEL: Record<OvieLauncherStatus, string> = {
  ready: 'Ready', unavailable: 'Unavailable',
  not_configured: 'Not configured', error: 'Error',
};

function LaunchControl({
  control,
}: Readonly<{ readonly control: OvieLauncherControl }>) {
  const disabled = control.status !== 'ready';
  return (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      disabled={disabled}
      aria-label={`${control.label}, ${STATUS_LABEL[control.status]}`}
      title={`${control.label}. ${control.why}`}
      data-testid={`ovie-launcher-${control.id}`}
      data-group={control.group}
      data-status={control.status}
      className='min-h-8 justify-start'
      onClick={() => {
        if (disabled) return;
        void launchOperatorControl({
          id: control.id,
          kind: control.kind,
          href: control.href,
          sshHost: control.sshHost,
        });
      }}
    >
      <span className='truncate'>{control.label}</span>
      <span className='ml-auto shrink-0 text-2xs text-tertiary-token'>
        {STATUS_LABEL[control.status]}
      </span>
    </Button>
  );
}

function LauncherGroup({
  group,
  controls,
}: Readonly<{
  readonly group: OvieLauncherGroup;
  readonly controls: readonly OvieLauncherControl[];
}>) {
  if (controls.length === 0) return null;
  const label = group === 'internal' ? 'Local / SSH' : 'Web';
  return (
    <fieldset
      className='min-w-0 flex-1 space-y-2 border-0 p-0'
      data-testid={`ovie-launcher-group-${group}`}
    >
      <legend className='text-2xs font-medium text-tertiary-token'>
        {label}
      </legend>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
        {controls.map(control => (
          <LaunchControl key={control.id} control={control} />
        ))}
      </div>
    </fieldset>
  );
}

function AllToolsList({
  controls,
}: Readonly<{ readonly controls: readonly OvieLauncherControl[] }>) {
  if (controls.length === 0) {
    return (
      <p className='text-xs text-secondary-token'>
        No tools match that search.
      </p>
    );
  }
  return (
    <ul className='grid gap-2'>
      {controls.map(c => (
        <li
          key={c.id}
          className='rounded-lg border border-subtle bg-surface-0 px-3 py-2'
          data-testid={`ovie-launcher-all-${c.id}`}
        >
          <p className='flex items-center justify-between gap-2 text-xs font-medium text-primary-token'>
            {c.label}
            <span className='text-2xs font-normal text-tertiary-token'>
              {STATUS_LABEL[c.status]}
            </span>
          </p>
          <p className='mt-1 text-2xs text-secondary-token'>
            {c.destinationDisplay}
          </p>
          <p className='mt-1 text-2xs text-tertiary-token'>{c.why}</p>
        </li>
      ))}
    </ul>
  );
}

export function OvieLauncherRail() {
  const [inventory, setInventory] = useState<OvieLauncherInventory | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [query, setQuery] = useState('');

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setFetchFailed(false);
    try {
      const response = await fetch(FETCH_URL, {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        setFetchFailed(true);
        return;
      }
      const payload = (await response.json()) as OvieLauncherInventory;
      setInventory(payload);
    } catch {
      setFetchFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const observation =
    isLoading && !inventory
      ? 'loading'
      : fetchFailed
        ? 'unavailable'
        : inventory
          ? 'fresh'
          : 'empty';
  const primaryInternal =
    inventory?.primary.filter(item => item.group === 'internal') ?? [];
  const primaryExternal =
    inventory?.primary.filter(item => item.group === 'external') ?? [];
  const filteredAll = useMemo(
    () => filterLaunchers(inventory?.all ?? [], query),
    [inventory, query]
  );

  return (
    <ContentSurfaceCard
      surface='details'
      className='min-h-40 space-y-3 p-3'
      data-testid='ovie-launcher-rail'
    >
      <div className='flex items-center justify-between gap-2'>
        <p className='text-xs font-caption text-tertiary-token'>Launchers</p>
        <p className='text-2xs text-tertiary-token'>Human controls first</p>
      </div>
      {isLoading && !inventory ? (
        <div
          className='grid min-h-16 grid-cols-2 gap-2 sm:grid-cols-4'
          aria-hidden
        >
          {[1, 2, 3, 4].map(slot => (
            <div
              key={slot}
              className='h-8 animate-pulse rounded-lg border border-subtle bg-surface-0 motion-reduce:animate-none'
            />
          ))}
        </div>
      ) : null}
      {inventory ? (
        <div className='flex flex-col gap-3 lg:flex-row'>
          <LauncherGroup group='internal' controls={primaryInternal} />
          <LauncherGroup group='external' controls={primaryExternal} />
        </div>
      ) : null}
      {observation === 'unavailable' ? (
        <HudObservationStatus
          state='unavailable'
          message='Launcher destinations could not be loaded.'
          onRetry={() => void fetchInventory()}
          testId='ovie-launcher-observation'
        />
      ) : null}
      <details className='group' data-testid='ovie-launcher-all-tools'>
        <summary className='cursor-pointer list-none rounded-lg border border-subtle bg-surface-0 px-3 py-2 text-xs font-medium text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'>
          All tools
        </summary>
        <div className='mt-3 space-y-3'>
          <Input
            type='search'
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search tools'
            aria-label='Search All Tools'
            data-testid='ovie-launcher-search'
          />
          <AllToolsList controls={filteredAll} />
        </div>
      </details>
    </ContentSurfaceCard>
  );
}
