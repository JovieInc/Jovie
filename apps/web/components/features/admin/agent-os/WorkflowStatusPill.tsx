import { Badge } from '@jovie/ui';
import type {
  AgentRunStatus,
  VerificationGateStatus,
} from '@/lib/agent-os/artifact';

const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
  stale: 'Stale',
};

const RUN_STATUS_VARIANT: Record<
  AgentRunStatus,
  'primary' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  queued: 'secondary',
  running: 'primary',
  blocked: 'warning',
  review: 'warning',
  done: 'success',
  failed: 'error',
  stale: 'secondary',
};

const GATE_STATUS_LABEL: Record<VerificationGateStatus, string> = {
  missing: 'Missing',
  queued: 'Queued',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  blocked: 'Blocked',
};

const GATE_STATUS_VARIANT: Record<
  VerificationGateStatus,
  'primary' | 'secondary' | 'success' | 'warning' | 'error'
> = {
  missing: 'secondary',
  queued: 'secondary',
  running: 'primary',
  passed: 'success',
  failed: 'error',
  skipped: 'secondary',
  blocked: 'warning',
};

interface WorkflowStatusPillProps {
  readonly status: AgentRunStatus;
}

interface VerificationStatusPillProps {
  readonly status: VerificationGateStatus;
}

export function WorkflowStatusPill({ status }: WorkflowStatusPillProps) {
  return (
    <Badge variant={RUN_STATUS_VARIANT[status]} size='sm'>
      {RUN_STATUS_LABEL[status]}
    </Badge>
  );
}

export function VerificationStatusPill({
  status,
}: VerificationStatusPillProps) {
  return (
    <Badge variant={GATE_STATUS_VARIANT[status]} size='sm'>
      {GATE_STATUS_LABEL[status]}
    </Badge>
  );
}
