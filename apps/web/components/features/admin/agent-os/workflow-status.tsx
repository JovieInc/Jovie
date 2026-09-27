import { StatusGlyph, type StatusGlyphState } from '@jovie/ui';
import type {
  AgentRunStatus,
  VerificationGateStatus,
} from '@/lib/agent-os/artifact';

/**
 * Agent-OS adapters over the canonical `StatusGlyph` (Pen jAcP1, D5). They
 * only map domain statuses onto glyph states + labels; the glyph, tooltip,
 * and accessibility contract live in `@jovie/ui`.
 */

const RUN_STATUS_GLYPH: Record<
  AgentRunStatus,
  { readonly state: StatusGlyphState; readonly label: string }
> = {
  queued: { state: 'todo', label: 'Queued' },
  running: { state: 'in_progress', label: 'Running' },
  blocked: { state: 'blocked', label: 'Blocked' },
  review: { state: 'in_review', label: 'Review' },
  done: { state: 'done', label: 'Done' },
  failed: { state: 'error', label: 'Failed' },
  stale: { state: 'canceled', label: 'Stale' },
};

const GATE_STATUS_GLYPH: Record<
  VerificationGateStatus,
  { readonly state: StatusGlyphState; readonly label: string }
> = {
  missing: { state: 'todo', label: 'Missing' },
  queued: { state: 'todo', label: 'Queued' },
  running: { state: 'in_progress', label: 'Running' },
  passed: { state: 'success', label: 'Passed' },
  failed: { state: 'error', label: 'Failed' },
  skipped: { state: 'canceled', label: 'Skipped' },
  blocked: { state: 'blocked', label: 'Blocked' },
};

export function WorkflowStatusGlyph({
  status,
}: {
  readonly status: AgentRunStatus;
}) {
  const spec = RUN_STATUS_GLYPH[status];
  return <StatusGlyph state={spec.state} label={spec.label} size='sm' />;
}

export function VerificationStatusGlyph({
  status,
}: {
  readonly status: VerificationGateStatus;
}) {
  const spec = GATE_STATUS_GLYPH[status];
  return <StatusGlyph state={spec.state} label={spec.label} size='sm' />;
}
