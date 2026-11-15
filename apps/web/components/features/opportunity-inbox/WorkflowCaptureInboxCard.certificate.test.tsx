import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WorkflowCaptureInboxCard } from './WorkflowCaptureInboxCard';

const hoisted = vi.hoisted(() => ({
  canRecord: true,
  startScreenRecording: vi.fn(),
  upload: vi.fn(),
  mutate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/capture/record-screen', () => ({
  canRecordScreen: () => hoisted.canRecord,
  startScreenRecording: hoisted.startScreenRecording,
}));

vi.mock('@/lib/workflow-capture/client', () => ({
  uploadWorkflowCapture: hoisted.upload,
  mutateWorkflowCaptureClient: hoisted.mutate,
  workflowCaptureMediaPath: (id: string) =>
    `/api/workflow-captures/${id}/media`,
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: hoisted.success, error: hoisted.error },
}));

const CARD: OpportunityInboxCardViewModel = {
  id: 'capture-1',
  signalType: 'other',
  typeLabel: 'Workflow',
  createdAt: '2026-08-28T10:00:00.000Z',
  title: 'Record the YouTube Studio thumbnail flow',
  why: 'Show Jovie how you start a native thumbnail experiment.',
  primaryActionLabel: 'Record',
  status: 'pending',
  category: 'workflow_capture',
  workflowCapture: {
    instructions: 'Stop before publishing.',
    startUrl: 'https://studio.youtube.com',
    expiresAt: '2099-01-01T00:00:00.000Z',
    state: 'pending',
  },
};

const REVIEW_CARD: OpportunityInboxCardViewModel = {
  ...CARD,
  workflowCapture: { ...CARD.workflowCapture!, state: 'uploaded_needs_review' },
};

function mount(card = CARD) {
  const onDismiss = vi.fn();
  const onComplete = vi.fn();
  const view = render(
    <WorkflowCaptureInboxCard
      card={card}
      onDismiss={onDismiss}
      onComplete={onComplete}
    />
  );
  return { ...view, onDismiss, onComplete };
}

describe('WorkflowCaptureInboxCard certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.canRecord = true;
  });

  it('offers the workflow link and dismisses the request', async () => {
    const user = userEvent.setup();
    const { container, onDismiss } = mount();

    expect(screen.getByRole('link', { name: 'Open Workflow' })).toHaveAttribute(
      'href',
      'https://studio.youtube.com'
    );
    expect(
      screen.getByText('Never record passwords, 2FA codes, or keys.')
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );
    expect(onDismiss).toHaveBeenCalledWith('capture-1');
    await expectNoA11yViolations(container);
  });

  it('reports that recording is unavailable in this window', async () => {
    const user = userEvent.setup();
    hoisted.canRecord = false;
    const { container } = mount();

    await user.click(screen.getByRole('button', { name: 'Record' }));

    expect(hoisted.error).toHaveBeenCalledWith(
      'Screen recording is not available in this window.'
    );
    expect(hoisted.startScreenRecording).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('reports a blocked recording and stays ready to record', async () => {
    const user = userEvent.setup();
    hoisted.startScreenRecording.mockRejectedValue(new Error('denied'));
    mount();

    await user.click(screen.getByRole('button', { name: 'Record' }));

    await waitFor(() =>
      expect(hoisted.error).toHaveBeenCalledWith(
        'Screen recording was blocked or cancelled.'
      )
    );
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });

  it('restores review when sending the recording fails', async () => {
    const user = userEvent.setup();
    hoisted.mutate.mockRejectedValue(new Error('Could not reach the task'));
    const { container, onComplete } = mount(REVIEW_CARD);

    expect(
      screen.getByRole('link', { name: 'Review Recording' })
    ).toHaveAttribute('href', '/api/workflow-captures/capture-1/media');
    await user.click(screen.getByRole('button', { name: 'Send Recording' }));

    await waitFor(() =>
      expect(hoisted.error).toHaveBeenCalledWith('Could not reach the task')
    );
    expect(hoisted.mutate).toHaveBeenCalledWith('capture-1', {
      action: 'mark-ready',
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Send Recording' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('deletes a reviewed recording and completes the card', async () => {
    const user = userEvent.setup();
    hoisted.mutate.mockResolvedValue(undefined);
    const { onComplete, onDismiss } = mount(REVIEW_CARD);

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('capture-1'));
    expect(hoisted.mutate).toHaveBeenCalledWith('capture-1', {
      action: 'revoke',
    });
    expect(hoisted.success).toHaveBeenCalledWith(
      'Recording deleted and access revoked.'
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('hides the workflow link when the request has none', async () => {
    const { container } = mount({
      ...CARD,
      workflowCapture: { ...CARD.workflowCapture!, startUrl: null },
    });

    expect(screen.queryByRole('link', { name: 'Open Workflow' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps a long and an Arabic request axe-clean', async () => {
    const longTitle =
      'Record the YouTube Studio thumbnail experiment flow from the channel dashboard through the test and compare setup';
    const { container, rerender } = mount({ ...CARD, title: longTitle });
    expect(screen.getAllByText(longTitle).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <WorkflowCaptureInboxCard
          card={{ ...CARD, title: 'سجّل خطوات الصورة المصغرة' }}
          onDismiss={vi.fn()}
          onComplete={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getAllByText('سجّل خطوات الصورة المصغرة').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
