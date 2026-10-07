// @coverage-via apps/web/app/app/(shell)/admin/presence/CompanyPresenceWorkspace.test.tsx
'use client';
import { SimpleTooltip } from '@jovie/ui';
import { Circle, CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { DrawerSection } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';
import type { ConnectionStatus, PresenceSignal } from './types';

/**
 * Presence status primitives shared by the creator Presence workspace and
 * Ovie's company Presence page (JOV-6770), so both render one status
 * vocabulary instead of forked badges.
 */
export function PresenceStatusBadge({
  status,
}: Readonly<{ status: ConnectionStatus }>) {
  const StatusIcon =
    status.tone === 'success'
      ? CircleCheck
      : status.tone === 'warning'
        ? CircleAlert
        : status.tone === 'error'
          ? CircleX
          : Circle;
  return (
    <SimpleTooltip
      content={
        <span>
          <strong className='block'>{status.label}</strong>
          <span>{status.nextAction}</span>
        </span>
      }
    >
      <span
        className={cn(
          'inline-flex min-h-7 items-center gap-1.5 text-xs text-tertiary-token',
          status.tone === 'success' && 'text-success',
          status.tone === 'warning' && 'text-warning',
          status.tone === 'error' && 'text-error'
        )}
      >
        <StatusIcon className='h-3.5 w-3.5 shrink-0' aria-hidden />
        <span className='min-w-0 whitespace-normal'>{status.label}</span>
      </span>
    </SimpleTooltip>
  );
}

const SIGNAL_LABELS: Readonly<Record<PresenceSignal['kind'], string>> = {
  blocker: 'Blocker',
  finding: 'Finding',
  recommendation: 'Recommendation',
  state: 'State',
};

/**
 * JOV-6170: signals render as four SEPARATE primitives with distinct weight —
 * blockers loudest, state quiet — never merged into one undifferentiated feed.
 */
export function PresenceSignalList({
  signals,
}: Readonly<{ signals: readonly PresenceSignal[] }>) {
  return (
    <DrawerSection title='Signals' sectionKind='status'>
      <ul className='space-y-2' data-testid='presence-signal-list'>
        {signals.map(signal => (
          <li
            key={`${signal.kind}:${signal.label}`}
            className='text-xs leading-5'
            data-testid={`presence-signal-${signal.kind}`}
          >
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                signal.tone === 'error' && 'text-error',
                signal.tone === 'warning' && 'text-warning',
                signal.tone === 'success' && 'text-success',
                signal.tone === 'neutral' && 'text-secondary-token'
              )}
            >
              {signal.tone === 'neutral' || signal.tone === 'success' ? (
                <Circle className='h-3 w-3' aria-hidden />
              ) : signal.tone === 'error' ? (
                <CircleX className='h-3 w-3' aria-hidden />
              ) : (
                <CircleAlert className='h-3 w-3' aria-hidden />
              )}
              <span className='sr-only'>{SIGNAL_LABELS[signal.kind]}:</span>
              {signal.label}
            </span>
            <span className='mt-0.5 block text-secondary-token'>
              {signal.detail}
            </span>
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}
