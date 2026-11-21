import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VisualQaReviewPanel } from './VisualQaReviewPanel';
import { visualQaRun, visualQaSurface } from './VisualQaReviewPanel.fixtures';

const RUNS_PATH = '/api/admin/hud/visual-qa';

/** Answers the runs request for one story; nothing reaches the API. */
function stubRuns(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === RUNS_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const answerWith = (runs: ReturnType<typeof visualQaRun>[]) => async () =>
  Response.json({ runs, fetchedAt: '2026-10-02T12:05:00Z' });

const meta = {
  title: 'Features/Admin/Hud/VisualQaReviewPanel/States',
  component: VisualQaReviewPanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof VisualQaReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the request never answers, so the panel keeps its loading row. */
export const Loading: Story = {
  beforeEach: stubRuns(() => new Promise<Response>(() => {})),
};

/** Empty: no capture run has been written yet. */
export const Empty: Story = {
  beforeEach: stubRuns(answerWith([])),
};

/** Error: the runs request fails, so the panel shows no runs. */
export const ErrorLoadFailed: Story = {
  beforeEach: stubRuns(async () => new Response('nope', { status: 500 })),
};

/** Partial: one surface has no capture, another already has a decision. */
export const Partial: Story = {
  beforeEach: stubRuns(
    answerWith([
      visualQaRun({
        surfaces: [
          visualQaSurface({
            surfaceId: 'pricing',
            title: 'Pricing',
            status: 'missing_capture',
            weightedDriftScore: null,
            overlayPath: null,
          }),
          visualQaSurface({
            surfaceId: 'profile',
            title: 'Profile',
            review: {
              surfaceId: 'profile',
              decision: 'accepted',
              reviewer: 'founder',
              reviewedAt: '2026-10-02T13:00:00Z',
              notes: null,
              followUpAction: null,
              dispatchId: null,
            },
          }),
        ],
      }),
    ])
  ),
};

/** Long content: a surface title and run id far past one line. */
export const LongContent: Story = {
  beforeEach: stubRuns(
    answerWith([
      visualQaRun({
        runId: 'run-2026-10-02-post-deploy-capture-for-every-marketing-surface',
        surfaces: [
          visualQaSurface({
            title:
              'Release announcement page with a very long localized title that wraps across several lines',
          }),
        ],
      }),
    ])
  ),
};

/** Offline: the network is down, so the load fails and no runs show. */
export const Offline: Story = {
  beforeEach: stubRuns(async () => {
    throw new TypeError('Failed to fetch');
  }),
};

/** Rtl: right-to-left layout keeps the card header and buttons aligned. */
export const RtlOverflow: Story = {
  beforeEach: stubRuns(answerWith([visualQaRun()])),
  decorators: [
    Story => (
      <div dir='rtl' className='w-full max-w-2xl'>
        <Story />
      </div>
    ),
  ],
};
