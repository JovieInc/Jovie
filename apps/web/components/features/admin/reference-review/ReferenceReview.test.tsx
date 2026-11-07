import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyReferenceCommand,
  referenceView,
} from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  scope,
  session,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';
import type {
  ReferenceCommand,
  ReferenceSession,
} from '@/lib/agent-os/design-reference-corpus/adaptive/types';
import { ReferenceReview } from './ReferenceReview';

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({ alt }: { alt: string }) => (
    <span role='img' aria-label={alt} />
  ),
}));
let state: ReferenceSession;
let sent: ReferenceCommand[];
let uncertain = false;
beforeEach(() => {
  state = session(2);
  sent = [];
  uncertain = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const { command } = JSON.parse(init.body as string) as {
          command: ReferenceCommand;
        };
        sent.push(command);
        state = applyReferenceCommand(state, scope, command);
        if (uncertain) {
          uncertain = false;
          throw new Error('Network interrupted');
        }
      }
      return new Response(JSON.stringify(referenceView(state, scope)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('image-first reference loop', () => {
  it('names a failed initial load and recovers through Retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    render(<ReferenceReview />);
    await screen.findByRole('alert');
    expect(screen.getByText('References unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: 'Select Reference 1' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('rates, removes the rated image, undoes and resumes from persisted state after remount', async () => {
    const first = render(<ReferenceReview />);
    await screen.findByRole('button', { name: 'Select Reference 1' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Start Keyboard Review' })
    );
    const area = screen.getByRole('region', { name: 'Reference Review' });
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(area, { key: '5' });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Select Reference 1' })
      ).toBeNull()
    );
    expect(state.ratings['ref-001']).toBe(5);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo' })).not.toBeDisabled()
    );
    expect(document.activeElement).toBe(area);
    fireEvent.keyDown(area, { key: 'z' });
    await screen.findByRole('button', { name: 'Select Reference 1' });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Rate 4 of 5' })
      ).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 of 5' }));
    await waitFor(() => expect(state.ratings['ref-001']).toBe(4));
    first.unmount();
    render(<ReferenceReview />);
    await screen.findByRole('button', { name: 'Select Reference 2' });
    expect(
      screen.queryByRole('button', { name: 'Select Reference 1' })
    ).toBeNull();
  });
  it('ignores edit-focus ratings and provides direct skip plus accessible cluster assignment', async () => {
    render(<ReferenceReview />);
    await screen.findByRole('button', { name: 'Select Reference 1' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New cluster' }), {
      key: '5',
    });
    expect(sent).toHaveLength(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'New cluster' }), {
      target: { value: 'Wardrobe' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Cluster' }));
    await screen.findByRole('option', { name: 'Wardrobe' });
    const id = Object.keys(state.clusters)[0];
    fireEvent.change(screen.getByRole('combobox', { name: 'Cluster' }), {
      target: { value: id },
    });
    await waitFor(() => expect(state.media['ref-001'].clusterId).toBe(id));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(state.skipped).toEqual(['ref-001']));
    expect(state.ratings).toEqual({});
  });
  it('retries an uncertain save with the same command ID and never rates twice', async () => {
    render(<ReferenceReview />);
    await screen.findByRole('button', { name: 'Select Reference 1' });
    uncertain = true;
    fireEvent.click(screen.getByRole('button', { name: 'Rate 5 of 5' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(Object.keys(state.ratings)).toHaveLength(1);
  });
});
