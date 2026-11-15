import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import {
  buildArtifact,
  buildPendingApprovalArtifact,
  LONG_RUN_TITLE,
} from './agentOsArtifact.test-fixtures';

const approved = buildArtifact({
  id: 'run-approved',
  title: 'Already approved run',
  humanApprovalRequired: true,
  humanGate: {
    required: true,
    status: 'approved',
    reason: null,
    reviewer: 'reviewer-1',
    reviewedAt: '2026-01-15T12:00:00.000Z',
  },
});
const notRequired = buildArtifact({ id: 'run-auto', title: 'Auto run' });

describe('ApprovalQueuePanel', () => {
  it('shows the empty copy and a zero count with nothing waiting', async () => {
    const { container } = render(
      <ApprovalQueuePanel
        artifacts={[approved, notRequired]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('No approvals waiting.')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Auto run')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('lists only runs still waiting on a human gate', async () => {
    const waiting = buildPendingApprovalArtifact({
      id: 'run-waiting',
      title: 'Waiting run',
    });
    const { container } = render(
      <ApprovalQueuePanel
        artifacts={[waiting, approved, notRequired]}
        selectedId={null}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Waiting run')).toBeInTheDocument();
    expect(screen.queryByText('Already approved run')).not.toBeInTheDocument();
    expect(screen.getByText('Review Required')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('calls onSelect with the clicked run and marks the selected one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const first = buildPendingApprovalArtifact({ id: 'a', title: 'First' });
    const second = buildPendingApprovalArtifact({ id: 'b', title: 'Second' });
    render(
      <ApprovalQueuePanel
        artifacts={[first, second]}
        selectedId='b'
        onSelect={onSelect}
      />
    );
    const secondButton = screen.getByRole('button', { name: /Second/ });
    expect(secondButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /First/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await user.click(screen.getByRole('button', { name: /First/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(first);
  });

  it('keeps long titles and an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ApprovalQueuePanel
          artifacts={[buildPendingApprovalArtifact({ title: LONG_RUN_TITLE })]}
          selectedId={null}
          onSelect={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText(LONG_RUN_TITLE)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
