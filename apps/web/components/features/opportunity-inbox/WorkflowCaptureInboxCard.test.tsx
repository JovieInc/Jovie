import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { WorkflowCaptureInboxCard } from './WorkflowCaptureInboxCard';

const hoisted = vi.hoisted(() => ({
  startScreenRecording: vi.fn(),
  stop: vi.fn(),
  upload: vi.fn(),
  mutate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/capture/record-screen', () => ({
  canRecordScreen: () => true,
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

describe('WorkflowCaptureInboxCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.startScreenRecording.mockResolvedValue({ stop: hoisted.stop });
    hoisted.stop.mockResolvedValue({
      file: new File(['recording'], 'workflow.webm', { type: 'video/webm' }),
      byteSize: 9,
      durationMs: 1_000,
    });
    hoisted.upload.mockResolvedValue({ state: 'uploaded_needs_review' });
    hoisted.mutate.mockResolvedValue({ state: 'ready' });
  });

  it('presents a direct Record action and credential warning', () => {
    render(
      <WorkflowCaptureInboxCard
        card={CARD}
        onDismiss={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Record' })).toBeVisible();
    expect(screen.getByTestId('opportunity-row-capture-1')).toHaveClass(
      '[&_button:first-of-type]:min-w-32'
    );
    expect(screen.getByText(/Never record passwords/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Workflow' })).toHaveAttribute(
      'href',
      'https://studio.youtube.com'
    );
  });

  it('records, privately uploads, requires review, then returns the receipt', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <WorkflowCaptureInboxCard
        card={CARD}
        onDismiss={vi.fn()}
        onComplete={onComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(hoisted.startScreenRecording).toHaveBeenCalledWith(
      'workflow_capture'
    );

    await user.click(screen.getByRole('button', { name: 'Stop Recording' }));
    await waitFor(() =>
      expect(hoisted.upload).toHaveBeenCalledWith(
        'capture-1',
        expect.any(Object)
      )
    );
    expect(
      screen.getByRole('link', { name: 'Review Recording' })
    ).toHaveAttribute('href', '/api/workflow-captures/capture-1/media');

    await user.click(screen.getByRole('button', { name: 'Send Recording' }));
    await waitFor(() => {
      expect(hoisted.mutate).toHaveBeenCalledWith('capture-1', {
        action: 'mark-ready',
      });
      expect(onComplete).toHaveBeenCalledWith('capture-1');
    });
  });

  it('revokes the private recording when dismissed during review', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <WorkflowCaptureInboxCard
        card={{
          ...CARD,
          workflowCapture: {
            ...CARD.workflowCapture!,
            state: 'uploaded_needs_review',
          },
        }}
        onDismiss={vi.fn()}
        onComplete={onComplete}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );

    await waitFor(() => {
      expect(hoisted.mutate).toHaveBeenCalledWith('capture-1', {
        action: 'revoke',
      });
      expect(onComplete).toHaveBeenCalledWith('capture-1');
    });
  });

  it('stops an active screen share when its Inbox card is removed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <WorkflowCaptureInboxCard
        card={CARD}
        onDismiss={vi.fn()}
        onComplete={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Record' }));
    unmount();

    await waitFor(() => expect(hoisted.stop).toHaveBeenCalledOnce());
    expect(hoisted.upload).not.toHaveBeenCalled();
  });
});
