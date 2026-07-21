'use client';

import * as Switch from '@radix-ui/react-switch';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { PageToolbar, TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { FlagEnvTier } from '@/lib/flags/env-tier';

interface FeatureFlagRow {
  readonly flagKey: string;
  readonly name: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  dev: boolean | null;
  staging: boolean | null;
  prod: boolean | null;
}

interface AdminFeaturesTableProps {
  readonly initialRows: readonly FeatureFlagRow[];
  readonly currentTier: FlagEnvTier;
}

const TIERS: readonly { key: FlagEnvTier; label: string }[] = [
  { key: 'dev', label: 'Dev' },
  { key: 'staging', label: 'Staging' },
  { key: 'prod', label: 'Prod' },
];

const columnHelper = createColumnHelper<FeatureFlagRow>();

/** Pure status labels for an env cell — exported for unit tests. */
export function getFlagEnvStatus(
  override: boolean | null,
  defaultEnabled: boolean
): {
  readonly effective: boolean;
  readonly overridden: boolean;
  readonly valueLabel: 'On' | 'Off';
  readonly sourceLabel: 'Default' | 'Override';
  readonly statusText: string;
} {
  const effective = override ?? defaultEnabled;
  const overridden = override !== null;
  const valueLabel = effective ? 'On' : 'Off';
  const sourceLabel = overridden ? 'Override' : 'Default';
  return {
    effective,
    overridden,
    valueLabel,
    sourceLabel,
    statusText: `${valueLabel} · ${sourceLabel}`,
  };
}

/** Single env switch cell. Module-scope to satisfy the no-inline-component rule. */
function FlagEnvCell({
  override,
  defaultEnabled,
  pending,
  envLabel,
  isCurrentTier,
  onSet,
  onClear,
}: Readonly<{
  override: boolean | null;
  defaultEnabled: boolean;
  pending: boolean;
  envLabel: string;
  isCurrentTier: boolean;
  onSet: (next: boolean) => void;
  onClear: () => void;
}>) {
  const { effective, overridden, valueLabel, sourceLabel, statusText } =
    getFlagEnvStatus(override, defaultEnabled);

  const switchLabel = isCurrentTier
    ? `${envLabel} (current): ${valueLabel}, ${sourceLabel}. Toggle value.`
    : `${envLabel}: ${valueLabel}, ${sourceLabel}. Toggle value.`;

  return (
    <div className='flex flex-col items-center gap-1 py-0.5'>
      <div className='flex items-center justify-center gap-1.5'>
        <Switch.Root
          checked={effective}
          disabled={pending}
          onCheckedChange={onSet}
          aria-label={switchLabel}
          className={`relative h-4 w-7 shrink-0 cursor-pointer rounded-full outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            effective ? 'bg-accent' : 'bg-surface-3'
          } ${overridden ? '' : 'opacity-70'}`}
        >
          <Switch.Thumb
            className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform dark:bg-white ${
              effective ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </Switch.Root>
        {/* Reserve the reset slot in every cell so toggling never shifts layout. */}
        <button
          type='button'
          onClick={onClear}
          disabled={pending || !overridden}
          title={overridden ? 'Reset to default' : undefined}
          aria-label={overridden ? `Reset ${envLabel} to default` : undefined}
          aria-hidden={!overridden}
          tabIndex={overridden ? 0 : -1}
          data-testid={
            overridden
              ? `flag-reset-${envLabel.toLowerCase()}`
              : 'flag-reset-slot'
          }
          data-overridden={overridden ? 'true' : 'false'}
          className={`shrink-0 text-quaternary-token transition-opacity hover:text-secondary-token ${
            overridden ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <RotateCcw size={11} aria-hidden />
        </button>
      </div>
      <span
        className='whitespace-nowrap text-2xs leading-none text-secondary-token'
        data-testid={`flag-env-status-${envLabel.toLowerCase()}`}
        data-source={sourceLabel.toLowerCase()}
        data-value={valueLabel.toLowerCase()}
      >
        <span className='sr-only'>
          {envLabel} effective value {valueLabel}, source {sourceLabel}.
        </span>
        <span aria-hidden>{statusText}</span>
      </span>
    </div>
  );
}

function FlagNameCell({
  name,
  description,
  flagKey,
}: Readonly<{
  name: string;
  description: string;
  flagKey: string;
}>) {
  const handleCopyKey = useCallback(async () => {
    const ok = await copyToClipboard(flagKey);
    if (ok) {
      toast.success(`Copied ${flagKey}`);
    } else {
      toast.error('Could not copy flag key.');
    }
  }, [flagKey]);

  return (
    <div className='min-w-0 space-y-0.5'>
      <span className='block truncate font-medium text-primary-token'>
        {name}
      </span>
      <button
        type='button'
        onClick={handleCopyKey}
        title='Copy flag key'
        aria-label={`Copy flag key ${flagKey}`}
        data-testid='flag-key'
        className='block max-w-full cursor-pointer truncate font-mono text-xs text-tertiary-token transition-colors hover:text-secondary-token'
      >
        {flagKey}
      </button>
      <span className='line-clamp-2 block text-xs leading-snug text-secondary-token'>
        {description}
      </span>
    </div>
  );
}

export function AdminFeaturesTable({
  initialRows,
  currentTier,
}: AdminFeaturesTableProps) {
  const [rows, setRows] = useState<FeatureFlagRow[]>(() =>
    initialRows.map(row => ({ ...row }))
  );
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const writeCell = useCallback(
    async (flagKey: string, tier: FlagEnvTier, next: boolean | null) => {
      const cellId = `${flagKey}:${tier}`;
      const previous = rows.find(r => r.flagKey === flagKey)?.[tier] ?? null;

      // Optimistic update.
      setRows(prev =>
        prev.map(r => (r.flagKey === flagKey ? { ...r, [tier]: next } : r))
      );
      setPending(prev => new Set(prev).add(cellId));

      try {
        const res = await fetch('/api/admin/feature-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flagKey, envTier: tier, enabled: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Revert on failure.
        setRows(prev =>
          prev.map(r =>
            r.flagKey === flagKey ? { ...r, [tier]: previous } : r
          )
        );
        toast.error('Could not save flag. Try again.');
      } finally {
        setPending(prev => {
          const nextSet = new Set(prev);
          nextSet.delete(cellId);
          return nextSet;
        });
      }
    },
    [rows]
  );

  const columns = useMemo(
    () =>
      [
        columnHelper.accessor('name', {
          header: 'Flag',
          cell: info => (
            <FlagNameCell
              name={info.getValue()}
              description={info.row.original.description}
              flagKey={info.row.original.flagKey}
            />
          ),
          meta: { className: 'min-w-70' },
        }),
        ...TIERS.map(tier =>
          columnHelper.accessor(tier.key, {
            header: () => (
              <span
                className={tier.key === currentTier ? 'text-accent' : undefined}
              >
                {tier.label}
                {tier.key === currentTier ? ' •' : ''}
              </span>
            ),
            enableSorting: false,
            cell: info => (
              <FlagEnvCell
                override={info.getValue() as boolean | null}
                defaultEnabled={info.row.original.defaultEnabled}
                pending={pending.has(
                  `${info.row.original.flagKey}:${tier.key}`
                )}
                envLabel={tier.label}
                isCurrentTier={tier.key === currentTier}
                onSet={next =>
                  writeCell(info.row.original.flagKey, tier.key, next)
                }
                onClear={() =>
                  writeCell(info.row.original.flagKey, tier.key, null)
                }
              />
            ),
            meta: { className: 'w-32 min-w-32 text-center' },
          })
        ),
      ] as ColumnDef<FeatureFlagRow, unknown>[],
    [currentTier, pending, writeCell]
  );

  const toolbar = (
    <PageToolbar
      start={
        <span className='text-tertiary-token text-xs'>
          {rows.length} runtime flags • this deploy is{' '}
          <span className='text-accent'>{currentTier}</span> • each cell shows
          On/Off and Default/Override
        </span>
      }
    />
  );

  return (
    <AdminTableShell testId='admin-features-table' toolbar={toolbar}>
      {() => (
        <AdminDataTable
          data={rows}
          columns={columns}
          enableVirtualization={false}
          emptyState={
            <TableEmptyState
              title='No feature flags'
              description='No runtime flags are registered.'
            />
          }
        />
      )}
    </AdminTableShell>
  );
}
