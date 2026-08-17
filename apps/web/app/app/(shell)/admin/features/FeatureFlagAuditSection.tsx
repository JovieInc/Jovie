'use client';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import type { FlagEnvTier } from '@/lib/flags/env-tier';
import {
  FlagChangeConfirmDialog,
  type FlagChangeConfirmRequest,
} from './FlagChangeConfirmDialog';

/** One audit row, shaped for the admin Features page (mirrors the server type). */
export interface FeatureFlagAuditRow {
  readonly id: string;
  readonly flagKey: string;
  readonly name: string;
  readonly envTier: string;
  readonly action: 'enable' | 'disable' | 'reset' | 'rollback';
  readonly actor: string | null;
  readonly previousValue: boolean | null;
  readonly previousSource: 'override' | 'default';
  readonly previousEffective: boolean | null;
  readonly newValue: boolean | null;
  readonly newSource: 'override' | 'default';
  readonly newEffective: boolean | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly createdAtLabel: string;
  readonly canRollback: boolean;
}

const ALL = 'all';

const ACTION_LABEL: Record<FeatureFlagAuditRow['action'], string> = {
  enable: 'Enable',
  disable: 'Disable',
  reset: 'Reset',
  rollback: 'Rollback',
};

function formatValue(
  effective: boolean | null,
  source: 'override' | 'default'
): string {
  const value = effective === null ? '—' : effective ? 'On' : 'Off';
  return `${value} · ${source === 'override' ? 'Override' : 'Default'}`;
}

interface PendingRollback {
  readonly event: FeatureFlagAuditRow;
  readonly confirm: FlagChangeConfirmRequest | null;
}

export function FeatureFlagAuditSection({
  events,
  currentTier,
}: Readonly<{
  readonly events: readonly FeatureFlagAuditRow[];
  readonly currentTier: FlagEnvTier;
}>) {
  const router = useRouter();
  const [envFilter, setEnvFilter] = useState<string>(ALL);
  const [flagFilter, setFlagFilter] = useState<string>(ALL);
  const [rollbackPending, setRollbackPending] = useState<string | null>(null);
  const [pendingRollback, setPendingRollback] =
    useState<PendingRollback | null>(null);

  const flagKeys = useMemo(
    () => [...new Set(events.map(event => event.flagKey))].sort(),
    [events]
  );

  const filtered = useMemo(
    () =>
      events.filter(
        event =>
          (envFilter === ALL || event.envTier === envFilter) &&
          (flagFilter === ALL || event.flagKey === flagFilter)
      ),
    [events, envFilter, flagFilter]
  );

  const runRollback = async (event: FeatureFlagAuditRow, reason?: string) => {
    setRollbackPending(event.id);
    try {
      const res = await fetch('/api/admin/feature-flags/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditEventId: event.id, reason }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Rolled back ${event.flagKey} (${event.envTier}).`);
      router.refresh();
    } catch {
      toast.error('Could not roll back this change. Try again.');
      throw new Error('flag rollback failed');
    } finally {
      setRollbackPending(null);
    }
  };

  /** Prod rollbacks reuse the confirmation dialog (reason required). */
  const requestRollback = (event: FeatureFlagAuditRow) => {
    if (event.envTier !== 'prod') {
      void runRollback(event).catch(() => undefined);
      return;
    }
    setPendingRollback({
      event,
      confirm: {
        title: 'Confirm production rollback',
        description: `This restores ${event.name} (${event.flagKey}) in production to ${formatValue(
          event.previousEffective,
          event.previousSource
        )}.`,
      },
    });
  };

  return (
    <section
      className='space-y-3'
      data-testid='feature-flag-audit-section'
      aria-label='Recent Flag Changes'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-semibold text-primary-token'>
          Recent Changes
        </h2>
        <div className='flex items-center gap-2'>
          <Select value={flagFilter} onValueChange={setFlagFilter}>
            <SelectTrigger
              className='h-8 w-44 px-2 text-xs'
              aria-label='Filter By Flag'
              data-testid='audit-filter-flag'
            >
              <SelectValue placeholder='All flags' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All flags</SelectItem>
              {flagKeys.map(key => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={envFilter} onValueChange={setEnvFilter}>
            <SelectTrigger
              className='h-8 w-32 px-2 text-xs'
              aria-label='Filter By Environment'
              data-testid='audit-filter-env'
            >
              <SelectValue placeholder='All environments' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All environments</SelectItem>
              <SelectItem value='dev'>Dev</SelectItem>
              <SelectItem value='staging'>Staging</SelectItem>
              <SelectItem value='prod'>Prod</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p
          className='rounded-lg border border-subtle px-4 py-6 text-center text-xs text-tertiary-token'
          data-testid='audit-empty'
        >
          {events.length === 0
            ? 'No flag changes recorded yet.'
            : 'No changes match the current filters.'}
        </p>
      ) : (
        <div className='overflow-x-auto rounded-lg border border-subtle'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr className='border-subtle border-b text-tertiary-token'>
                <th className='px-3 py-2 font-medium'>Time</th>
                <th className='px-3 py-2 font-medium'>Flag</th>
                <th className='px-3 py-2 font-medium'>Env</th>
                <th className='px-3 py-2 font-medium'>Action</th>
                <th className='px-3 py-2 font-medium'>Change</th>
                <th className='px-3 py-2 font-medium'>Actor</th>
                <th className='px-3 py-2 font-medium'>Reason</th>
                <th className='px-3 py-2 font-medium'>
                  <span className='sr-only'>Rollback</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(event => (
                <tr
                  key={event.id}
                  className='border-subtle border-b last:border-0'
                  data-testid={`audit-event-${event.id}`}
                >
                  <td className='whitespace-nowrap px-3 py-2 text-secondary-token'>
                    {event.createdAtLabel}
                  </td>
                  <td className='px-3 py-2'>
                    <span className='block font-medium text-primary-token'>
                      {event.name}
                    </span>
                    <span className='block font-mono text-2xs text-tertiary-token'>
                      {event.flagKey}
                    </span>
                  </td>
                  <td className='px-3 py-2'>
                    <Badge
                      variant={
                        event.envTier === currentTier ? 'default' : 'secondary'
                      }
                    >
                      {event.envTier}
                    </Badge>
                  </td>
                  <td className='px-3 py-2 text-secondary-token'>
                    {ACTION_LABEL[event.action]}
                  </td>
                  <td className='whitespace-nowrap px-3 py-2 text-secondary-token'>
                    {formatValue(event.previousEffective, event.previousSource)}
                    {' → '}
                    {formatValue(event.newEffective, event.newSource)}
                  </td>
                  <td className='max-w-32 truncate px-3 py-2 font-mono text-2xs text-tertiary-token'>
                    {event.actor ?? '—'}
                  </td>
                  <td className='max-w-48 truncate px-3 py-2 text-secondary-token'>
                    {event.reason ?? '—'}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    {event.canRollback ? (
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => requestRollback(event)}
                        disabled={rollbackPending !== null}
                        aria-label={`Roll back ${event.flagKey} ${event.envTier} change from ${event.createdAtLabel}`}
                        data-testid={`audit-rollback-${event.id}`}
                        className='text-tertiary-token hover:text-secondary-token'
                      >
                        <RotateCcw size={12} aria-hidden className='mr-1' />
                        {rollbackPending === event.id
                          ? 'Rolling back…'
                          : 'Rollback'}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FlagChangeConfirmDialog
        request={pendingRollback?.confirm ?? null}
        open={pendingRollback?.confirm != null}
        onOpenChange={open => {
          if (!open) setPendingRollback(null);
        }}
        onConfirm={async reason => {
          if (!pendingRollback) return;
          await runRollback(pendingRollback.event, reason);
        }}
      />
    </section>
  );
}
