import { ShieldCheck } from 'lucide-react';
import type { VerificationGate } from '@/lib/agent-os/artifact';
import { VerificationStatusPill } from './WorkflowStatusPill';

const GATE_LABELS: Record<VerificationGate['name'], string> = {
  'gstack.qa.exhaustive': 'GStack / QA / Exhaustive',
  'gstack.review': 'GStack / Review',
  'gstack.ship': 'GStack / Ship',
  'github.ci': 'GitHub / CI',
  'github.scope-judge': 'GitHub / Scope Judge',
  'github.coderabbit': 'GitHub / CodeRabbit',
  'github.greptile': 'GitHub / Greptile',
  'github.branch-protection': 'GitHub / Branch Protection',
  'gstack.land-and-deploy': 'GStack / Land And Deploy',
  'sentry.canary': 'Sentry / Canary',
};

function formatGateName(name: VerificationGate['name']): string {
  return GATE_LABELS[name];
}

interface VerificationGateListProps {
  readonly gates: readonly VerificationGate[];
}

export function VerificationGateList({ gates }: VerificationGateListProps) {
  if (gates.length === 0) {
    return (
      <div className='rounded-lg bg-surface-0 px-3 py-3 text-[12px] text-tertiary-token'>
        No gates recorded.
      </div>
    );
  }

  return (
    <div className='grid gap-2'>
      {gates.map(gate => (
        <div
          key={gate.name}
          className='grid gap-2 rounded-lg bg-surface-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]'
        >
          <div className='min-w-0'>
            <div className='flex min-w-0 items-center gap-2'>
              <ShieldCheck
                className='size-3.5 shrink-0 text-tertiary-token'
                aria-hidden='true'
              />
              <p className='truncate text-[12.5px] font-[540] text-primary-token'>
                {formatGateName(gate.name)}
              </p>
            </div>
            <p className='mt-1 text-[11.5px] leading-4 text-tertiary-token'>
              {gate.summary ??
                (gate.required ? 'Required gate.' : 'Optional gate.')}
            </p>
          </div>
          <div className='flex items-center gap-2 sm:justify-end'>
            <span className='text-[11px] text-tertiary-token'>
              {gate.required ? 'Required' : 'Optional'}
            </span>
            <VerificationStatusPill status={gate.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
