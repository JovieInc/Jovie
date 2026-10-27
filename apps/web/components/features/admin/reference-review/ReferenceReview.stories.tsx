import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type {
  ReferenceCommand,
  ReferenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { ReferenceReview } from './ReferenceReview';
import '@/styles/system-b-app.css';

/** Synthetic browser fixtures only; no discovered source or personal ratings. */
function fixture(empty = false): ReferenceView {
  return {
    revision: 1,
    batchNumber: 1,
    batchSize: empty ? 0 : 25,
    ratedCount: 0,
    remaining: empty ? 0 : 25,
    heldCount: 0,
    canUndo: false,
    undoReferenceId: null,
    clusters: {},
    boards: {},
    top: [],
    items: empty
      ? []
      : Array.from({ length: 25 }, (_, i) => ({
          id: `story-${i + 1}`,
          title: `Synthetic reference ${i + 1}`,
          previewUrl: '/images/mock-profile/drawer-releases/release-1.png',
          sourceUrl: 'https://example.test/reference',
          credit: 'Synthetic UI fixture, not reference provenance',
          width: 100,
          height: 100,
          category: 'editorial',
          clusterId: null,
          rating: null,
        })),
  };
}
function ReferenceReviewFixture({
  mode = 'ready',
}: {
  readonly mode?: 'ready' | 'empty' | 'loading' | 'error';
}) {
  useLayoutEffect(() => {
    const original = globalThis.fetch;
    let view = fixture(mode === 'empty');
    let previous: ReferenceView | null = null;
    const mock: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.includes('/api/admin/reference-review'))
        return original(input, init);
      if (mode === 'error') return new Response('{}', { status: 503 });
      if (mode === 'loading')
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        );
      if (init?.method === 'POST') {
        const { action } = (
          JSON.parse(String(init.body)) as { command: ReferenceCommand }
        ).command;
        if (action.type === 'rate' || action.type === 'skip') {
          previous = structuredClone(view);
          view = {
            ...view,
            revision: view.revision + 1,
            items: view.items.filter(i => i.id !== action.referenceId),
            remaining: view.remaining - 1,
            ratedCount: view.ratedCount + (action.type === 'rate' ? 1 : 0),
            canUndo: true,
            undoReferenceId: action.referenceId,
          };
        } else if (action.type === 'undo' && previous) {
          view = { ...previous, revision: view.revision + 1 };
          previous = null;
        } else if (action.type === 'create-cluster')
          view = {
            ...view,
            revision: view.revision + 1,
            clusters: { ...view.clusters, [action.clusterId]: action.label },
            boards: { ...view.boards, [action.clusterId]: [] },
          };
        else if (action.type === 'cluster') {
          const selected = view.items.find(i => i.id === action.referenceId);
          view = {
            ...view,
            revision: view.revision + 1,
            items: view.items.map(i =>
              i.id === action.referenceId
                ? { ...i, clusterId: action.clusterId }
                : i
            ),
            boards: Object.fromEntries(
              Object.entries(view.boards).map(([id, items]) => [
                id,
                [
                  ...items.filter(i => i.id !== action.referenceId),
                  ...(id === action.clusterId && selected ? [selected] : []),
                ],
              ])
            ),
          };
        }
      }
      return new Response(JSON.stringify(view), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
    globalThis.fetch = mock;
    return () => {
      if (globalThis.fetch === mock) globalThis.fetch = original;
    };
  }, [mode]);
  return (
    <div className='h-screen'>
      <ReferenceReview key={mode} />
    </div>
  );
}
const meta = {
  title: 'Admin/ReferenceReview',
  component: ReferenceReview,
  parameters: { layout: 'fullscreen' },
  render: () => <ReferenceReviewFixture />,
} satisfies Meta<typeof ReferenceReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', {
      name: 'Select Synthetic reference 1',
    });
    await userEvent.click(
      canvas.getByRole('button', { name: 'Start Keyboard Review' })
    );
    await userEvent.keyboard('5');
    await expect(
      canvas.queryByRole('button', {
        name: 'Select Synthetic reference 1',
      })
    ).not.toBeInTheDocument();
  },
};
export const Empty: Story = {
  render: () => <ReferenceReviewFixture mode='empty' />,
};
export const Loading: Story = {
  render: () => <ReferenceReviewFixture mode='loading' />,
};
export const Unavailable: Story = {
  render: () => <ReferenceReviewFixture mode='error' />,
};
