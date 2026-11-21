import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VisualQaReviewPanel } from './VisualQaReviewPanel';
import { visualQaRun } from './VisualQaReviewPanel.fixtures';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/components/feedback', () => ({ toast: toastMock }));

const fetchMock = vi.fn();

function runsResponse(runs: ReturnType<typeof visualQaRun>[]) {
  return Response.json({ runs, fetchedAt: '2026-10-02T12:05:00Z' });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  vi.unstubAllGlobals();
});

describe('VisualQaReviewPanel', () => {
  it('shows the loading row, then an empty message when no runs exist', async () => {
    fetchMock.mockResolvedValueOnce(runsResponse([]));
    const { container } = render(<VisualQaReviewPanel />);
    expect(screen.getByText(/Loading Visual QA runs/)).toBeInTheDocument();
    expect(await screen.findByText(/No Visual QA runs captured/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('reports a failed load through a toast', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 500 }));
    render(<VisualQaReviewPanel />);
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        'Failed to load Visual QA runs (500)'
      )
    );
  });

  it('accepts a drifted surface with a POST and reloads the runs', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(runsResponse([visualQaRun()]))
      .mockResolvedValueOnce(Response.json({ review: { dispatchId: null } }))
      .mockResolvedValueOnce(runsResponse([visualQaRun()]));
    const { container } = render(<VisualQaReviewPanel />);

    expect(await screen.findByText('Drift Detected')).toBeVisible();
    expect(screen.getByText('Baseline')).not.toHaveClass('uppercase');
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Visual drift accepted.')
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/admin/hud/visual-qa/run-1/review');
    expect(JSON.parse(init.body)).toEqual({
      surfaceId: 'home',
      decision: 'accepted',
    });
  });

  it('rejects a surface and announces the dispatched follow-up', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(runsResponse([visualQaRun()]))
      .mockResolvedValueOnce(Response.json({ review: { dispatchId: 'd-1' } }))
      .mockResolvedValueOnce(runsResponse([visualQaRun()]));
    render(<VisualQaReviewPanel />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        'Visual drift rejected; follow-up dispatched.'
      )
    );
  });

  it('surfaces the server error when a review fails', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(runsResponse([visualQaRun()]))
      .mockResolvedValueOnce(
        Response.json({ error: 'Already reviewed' }, { status: 409 })
      );
    render(<VisualQaReviewPanel />);

    await user.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Already reviewed')
    );
  });
});
