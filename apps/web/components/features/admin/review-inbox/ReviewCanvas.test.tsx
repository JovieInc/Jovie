import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewInboxMarks } from '@/lib/ovie/review-inbox/contract';
import {
  createPilotReviewCase,
  PILOT_V1_DIGEST,
} from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewCanvas } from './ReviewCanvas';

const asset = createPilotReviewCase().candidates[0]!;
const empty: ReviewInboxMarks = { pins: [], strokes: [] };

function surface() {
  const node = screen.getByTestId('review-canvas-surface');
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return node;
}

describe('ReviewCanvas', () => {
  it('draws a freehand stroke with the pointer, undoes, redraws and saves it with the revision', async () => {
    const onSave = vi.fn();
    render(<ReviewCanvas asset={asset} marks={empty} onSave={onSave} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Draw' }));
    const node = surface();
    expect(node).toHaveAttribute('data-tool', 'draw');

    const drag = () => {
      fireEvent.pointerDown(node, { clientX: 20, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(node, { clientX: 60, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(node, { clientX: 100, clientY: 50, pointerId: 1 });
    };
    drag();
    expect(screen.getAllByTestId('review-canvas-stroke')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryAllByTestId('review-canvas-stroke')).toHaveLength(0);

    drag();
    await userEvent.click(
      screen.getByRole('button', { name: 'Request changes' })
    );

    expect(onSave).toHaveBeenCalledOnce();
    const draft = onSave.mock.calls[0]![0];
    expect(draft.pins).toEqual([]);
    expect(draft.strokes).toHaveLength(1);
    expect(draft.strokes[0]).toMatchObject({
      assetDigest: PILOT_V1_DIGEST,
      revision: 'v1',
      points: [
        [0.1, 0.1],
        [0.3, 0.4],
        [0.5, 0.5],
      ],
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved with this revision.'
      )
    );
    // Saved drafts clear; the parent's saved marks take over.
    expect(screen.queryAllByTestId('review-canvas-stroke')).toHaveLength(0);
  });

  it('places a pin from the keyboard and keeps the draft when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('offline'));
    render(<ReviewCanvas asset={asset} marks={empty} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText('Pin note'), 'Tighten crop');
    const node = surface();
    node.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    const pins = screen.getAllByTestId('review-canvas-pin');
    expect(pins).toHaveLength(1);
    expect(pins[0]).toHaveStyle({ left: '54%', top: '50%' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Request changes' })
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Not saved/)
    );
    expect(screen.getAllByTestId('review-canvas-pin')).toHaveLength(1);
    expect(screen.getByText('1 unsaved mark')).toBeInTheDocument();
  });

  it('draws with the keyboard and switches tools with P and D', async () => {
    const onSave = vi.fn();
    render(<ReviewCanvas asset={asset} marks={empty} onSave={onSave} />);
    const node = surface();
    node.focus();
    await userEvent.keyboard('d');
    expect(node).toHaveAttribute('data-tool', 'draw');
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getAllByTestId('review-canvas-stroke')).toHaveLength(1);
    await userEvent.keyboard('p');
    expect(node).toHaveAttribute('data-tool', 'pin');
  });

  it('shows saved marks on an older revision as stale and read only', () => {
    render(
      <ReviewCanvas
        asset={asset}
        marks={{
          pins: [],
          strokes: [
            {
              id: 's1',
              assetDigest: PILOT_V1_DIGEST,
              revision: 'v1',
              points: [
                [0.1, 0.1],
                [0.2, 0.2],
              ],
              author: 'founder',
            },
            {
              id: 'other-asset',
              assetDigest: 'another-digest',
              revision: 'v1',
              points: [
                [0.1, 0.1],
                [0.2, 0.2],
              ],
              author: 'founder',
            },
          ],
        }}
        stale
        newerRevision='v2'
        onSave={vi.fn()}
      />
    );
    expect(screen.getByTestId('review-canvas-stale')).toHaveTextContent(
      'Stale · v2 is newer'
    );
    const strokes = screen.getAllByTestId('review-canvas-stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toHaveAttribute('stroke-dasharray', '6 6');
    expect(screen.getByTestId('review-canvas-surface')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Request changes' })
    ).not.toBeInTheDocument();
  });
});
