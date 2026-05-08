import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { WorkflowRunRow } from './WorkflowRunRow';

interface ApprovalQueuePanelProps {
  readonly artifacts: readonly AgentRunArtifact[];
  readonly selectedId: string | null;
  readonly onSelect: (artifact: AgentRunArtifact) => void;
}

function needsApproval(artifact: AgentRunArtifact): boolean {
  return (
    artifact.humanApprovalRequired && artifact.humanGate.status !== 'approved'
  );
}

export function ApprovalQueuePanel({
  artifacts,
  selectedId,
  onSelect,
}: ApprovalQueuePanelProps) {
  const approvalArtifacts = artifacts.filter(needsApproval);

  return (
    <div className='rounded-lg border border-subtle bg-surface-0 p-3'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-[12.5px] font-[560] text-primary-token'>
          Approval Queue
        </p>
        <span className='text-[11px] text-tertiary-token'>
          {approvalArtifacts.length}
        </span>
      </div>

      {approvalArtifacts.length > 0 ? (
        <div className='mt-3 grid gap-2'>
          {approvalArtifacts.map(artifact => (
            <WorkflowRunRow
              key={artifact.id}
              artifact={artifact}
              isSelected={artifact.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <p className='mt-3 text-[12px] leading-5 text-tertiary-token'>
          No approvals waiting.
        </p>
      )}
    </div>
  );
}
