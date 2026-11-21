import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/feedback';
import type {
  VisualQaReviewRun,
  VisualQaReviewSurface,
} from '@/lib/agent-os/visual-qa/review';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VisualQaReviewPanel } from './VisualQaReviewPanel';

vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function surface(
  overrides: Partial<VisualQaReviewSurface> = {}
): VisualQaReviewSurface {
  return {
    surfaceId: 'admin-hud',
    title: 'Admin HUD',
    baselinePath: 'baseline.png',
    afterPath: 'after.png',
    overlayPath: 'overlay.png',
    rawDiffRatio: 0.02,
    weightedDriftScore: 0.0412,
    threshold: 0.01,
    status: 'drift_detected',
    review: null,
    ...overrides,
  };
}

function run(surfaces: VisualQaReviewSurface[]): VisualQaReviewRun {
  return {
    runId: 'run-1',
    computedAt: '2026-09-01T12:00:00.000Z',
    passed: false,
    surfaces,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('VisualQaReviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading row, then the drift runs with no accessibility violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ runs: [run([surface()])], fetchedAt: 'now' })
        )
    );
    const { container } = render(<VisualQaReviewPanel />);

    expect(screen.getByText(/Loading Visual QA runs/)).toBeInTheDocument();
    expect(await screen.findByText('Admin HUD')).toBeInTheDocument();
    expect(screen.getByText('Drift Detected')).toBeInTheDocument();
    expect(screen.getByText(/HUD-VQA-001/)).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    // Captions are written in Title Case, not forced to capitals.
    expect(screen.getByText('Diff Overlay').className).not.toContain(
      'uppercase'
    );
    await expectNoA11yViolations(container);
  });

  it('shows Not Available in place of missing captures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        json({
          runs: [
            run([
              surface({
                status: 'missing_capture',
                overlayPath: null,
                weightedDriftScore: null,
              }),
            ]),
          ],
          fetchedAt: 'now',
        })
      )
    );
    const { container } = render(<VisualQaReviewPanel />);

    expect(await screen.findByText('Missing Capture')).toBeInTheDocument();
    expect(screen.getAllByText('Not available')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('explains an empty inbox', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json({ runs: [], fetchedAt: 'now' }))
    );
    const { container } = render(<VisualQaReviewPanel />);

    expect(
      await screen.findByText(/No Visual QA runs captured yet/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports a failed load through the toast and shows the empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json({ error: 'nope' }, 500))
    );
    render(<VisualQaReviewPanel />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load Visual QA runs (500)'
      )
    );
    expect(
      await screen.findByText(/No Visual QA runs captured yet/)
    ).toBeInTheDocument();
  });

  it('reports an offline load through the toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    );
    render(<VisualQaReviewPanel />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to fetch')
    );
  });

  it('accepts a surface, posts the decision and reloads', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ runs: [run([surface()])], fetchedAt: 'a' }))
      .mockResolvedValueOnce(json({ review: { dispatchId: null } }))
      .mockResolvedValueOnce(
        json({
          runs: [
            run([
              surface({
                review: {
                  surfaceId: 'admin-hud',
                  decision: 'accepted',
                  reviewer: 'tim@example.com',
                  reviewedAt: '2026-09-01T13:00:00.000Z',
                  notes: null,
                  followUpAction: null,
                  dispatchId: null,
                },
              }),
            ]),
          ],
          fetchedAt: 'b',
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<VisualQaReviewPanel />);

    const card = await screen.findByTestId(
      'visual-qa-surface-card-run-1-admin-hud'
    );
    await user.click(within(card).getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Visual drift accepted.')
    );
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/admin/hud/visual-qa/run-1/review');
    expect(JSON.parse(init.body)).toEqual({
      surfaceId: 'admin-hud',
      decision: 'accepted',
    });
    expect(await screen.findByText(/Accepted by/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Accept' })
    ).not.toBeInTheDocument();
  });

  it('surfaces the server message when a rejection fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ runs: [run([surface()])], fetchedAt: 'a' })
        )
        .mockResolvedValueOnce(json({ error: 'Already reviewed' }, 409))
    );
    render(<VisualQaReviewPanel />);

    await user.click(await screen.findByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Already reviewed')
    );
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });
});
