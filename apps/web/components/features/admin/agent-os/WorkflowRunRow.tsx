import { Clock3 } from 'lucide-react';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { cn } from '@/lib/utils';
import { WorkflowStatusPill } from './WorkflowStatusPill';

const HUMAN_GATE_LABELS: Record<
  AgentRunArtifact['humanGate']['status'],
  string
> = {
  not_required: 'Not Required',
  pending: 'Review Required',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

interface WorkflowRunRowProps {
  readonly artifact: AgentRunArtifact;
  readonly isSelected?: boolean;
  readonly onSelect?: (artifact: AgentRunArtifact) => void;
}

export function WorkflowRunRow({
  artifact,
  isSelected = false,
  onSelect,
}: WorkflowRunRowProps) {
  const className = cn(
    'grid w-full gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
    isSelected && 'border-(--linear-border-focus) bg-surface-0'
  );
  const content = (
    <>
      <div className='flex min-w-0 items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-[13px] font-[560] text-primary-token'>
            {artifact.title}
          </p>
          <p className='mt-1 line-clamp-2 text-[11.5px] leading-4 text-tertiary-token'>
            {artifact.summary}
          </p>
        </div>
        <div className='grid shrink-0 justify-items-end gap-1'>
          <WorkflowStatusPill status={artifact.status} />
          {artifact.humanApprovalRequired ? (
            <span className='rounded-md border border-warning/20 bg-surface-0 px-1.5 py-0.5 text-[10.5px] font-[520] text-warning'>
              {HUMAN_GATE_LABELS[artifact.humanGate.status]}
            </span>
          ) : null}
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary-token'>
        <span>{artifact.modelRoute}</span>
        <span>{artifact.source}</span>
        <span className='inline-flex items-center gap-1'>
          <Clock3 className='size-3' aria-hidden='true' />
          {formatUpdatedAt(artifact.updatedAt)}
        </span>
      </div>
    </>
  );

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type='button'
      onClick={() => onSelect(artifact)}
      className={className}
      aria-pressed={isSelected}
    >
      {content}
    </button>
  );
}
