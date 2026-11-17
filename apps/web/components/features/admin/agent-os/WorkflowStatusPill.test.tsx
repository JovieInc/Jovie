import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_STATUSES,
  VerificationGateStatusSchema,
} from '@/lib/agent-os/artifact';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  VerificationStatusPill,
  WorkflowStatusPill,
} from './WorkflowStatusPill';

const RUN_LABELS = {
  queued: 'Queued',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
  stale: 'Stale',
} as const;

const GATE_LABELS = {
  missing: 'Missing',
  queued: 'Queued',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  blocked: 'Blocked',
} as const;

describe('WorkflowStatusPill', () => {
  it.each(AGENT_RUN_STATUSES)('labels the %s run status', async status => {
    const { container } = render(<WorkflowStatusPill status={status} />);
    expect(screen.getByText(RUN_LABELS[status])).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the failed run as its own label, not a neighbour status', () => {
    render(<WorkflowStatusPill status='failed' />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });
});

describe('VerificationStatusPill', () => {
  it.each(VerificationGateStatusSchema.options)(
    'labels the %s gate status',
    async status => {
      const { container } = render(<VerificationStatusPill status={status} />);
      expect(screen.getByText(GATE_LABELS[status])).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );
});
