'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/HudDrilldownSearch.test.tsx

import { Button, Input } from '@jovie/ui';
import { CircleAlert, Search } from 'lucide-react';
import { useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { deriveOpsExceptions } from '@/lib/hud/cockpit';
import {
  filterOpsExceptions,
  getHudDrilldownTarget,
  HUD_DRILLDOWN_SCOPE_LABELS,
  HUD_DRILLDOWN_SCOPES,
  type HudDrilldownScope,
} from '@/lib/hud/drilldowns';
import type { HudMetrics } from '@/types/hud';

/**
 * Searchable drill-downs (JOV-5312): one canonical search on `/hud` that
 * routes customer, release, and event queries to their authoritative admin
 * records, and filters live operational exceptions in place.
 */
export function HudDrilldownSearch({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const [scope, setScope] = useState<HudDrilldownScope>('customers');
  const [query, setQuery] = useState('');
  const target = getHudDrilldownTarget(scope);
  const exceptions = filterOpsExceptions(deriveOpsExceptions(metrics), query);

  return (
    <ContentSurfaceCard surface='details' data-testid='hud-drilldowns'>
      <div className='space-y-3 p-3'>
        <div
          className='flex flex-wrap items-center gap-1'
          role='tablist'
          aria-label='Drill-down Scope'
        >
          {HUD_DRILLDOWN_SCOPES.map(option => (
            <Button
              key={option}
              type='button'
              role='tab'
              aria-selected={scope === option}
              variant={scope === option ? 'secondary' : 'ghost'}
              size='sm'
              data-testid={`hud-drilldown-scope-${option}`}
              onClick={() => {
                setScope(option);
                setQuery('');
              }}
            >
              {HUD_DRILLDOWN_SCOPE_LABELS[option]}
            </Button>
          ))}
        </div>

        {scope === 'exceptions' ? (
          <div className='space-y-2'>
            <Input
              type='search'
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Filter exceptions'
              aria-label='Filter Exceptions'
              data-testid='hud-drilldown-search'
            />
            {exceptions.length === 0 ? (
              <p className='text-xs text-secondary-token'>
                {query.trim()
                  ? 'No exceptions match your search.'
                  : 'Systems nominal.'}
              </p>
            ) : (
              <ul className='grid gap-2'>
                {exceptions.map(exception => (
                  <li
                    key={exception.id}
                    className='rounded-lg border border-subtle bg-surface-0 px-3 py-2'
                    data-testid={`hud-drilldown-exception-${exception.id}`}
                  >
                    <a
                      href={exception.href ?? APP_ROUTES.ADMIN_OPERATIONS}
                      className='flex items-center gap-1.5 text-xs font-medium text-primary-token hover:underline'
                    >
                      <CircleAlert
                        className='h-3 w-3 shrink-0 text-error'
                        aria-hidden='true'
                      />
                      <span className='truncate'>{exception.label}</span>
                    </a>
                    {exception.detail ? (
                      <p className='mt-0.5 truncate text-2xs text-tertiary-token'>
                        {exception.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <form
            action={target.action}
            method='GET'
            className='flex items-center gap-2'
            data-testid='hud-drilldown-form'
          >
            {Object.entries(target.hiddenParams).map(([name, value]) => (
              <input key={name} type='hidden' name={name} value={value} />
            ))}
            <Input
              type='search'
              name='q'
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`Search ${HUD_DRILLDOWN_SCOPE_LABELS[scope].toLowerCase()}`}
              aria-label={`Search ${HUD_DRILLDOWN_SCOPE_LABELS[scope]}`}
              data-testid='hud-drilldown-search'
            />
            <Button
              type='submit'
              variant='secondary'
              size='sm'
              className='shrink-0'
            >
              <Search className='h-3.5 w-3.5' aria-hidden='true' />
              Search
            </Button>
          </form>
        )}

        <p className='text-2xs text-tertiary-token'>
          Authoritative record: {target.recordLabel}
        </p>
      </div>
    </ContentSurfaceCard>
  );
}
