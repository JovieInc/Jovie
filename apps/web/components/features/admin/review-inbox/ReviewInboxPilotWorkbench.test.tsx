import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxPilotWorkbench } from './ReviewInboxPilotWorkbench';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ReviewInboxPilotWorkbench', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (
          url.includes('/api/ovie/inbox') &&
          init?.method?.toUpperCase() === 'POST'
        ) {
          return new Response(JSON.stringify({ receipt: { ack: true } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ case: createPilotReviewCase() }), {
          status: 200,
        });
      })
    );
  });

  it('renders list and editorial views for the synthetic pilot case', async () => {
    render(<ReviewInboxPilotWorkbench />, { wrapper: Wrapper });
    expect(
      await screen.findByTestId('review-inbox-pilot-workbench')
    ).toBeTruthy();
    expect(screen.getByTestId('review-inbox-canvas-view')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    expect(screen.getByTestId('review-inbox-list-view')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Decision' }));
    await waitFor(() =>
      expect(screen.getByTestId('review-inbox-editorial-view')).toBeTruthy()
    );
    expect(
      screen.getByTestId('review-inbox-approval-disclosure')
    ).toHaveTextContent(/private test library/i);
  });

  it('sends drawn strokes with the active revision through the review route', async () => {
    render(<ReviewInboxPilotWorkbench />, { wrapper: Wrapper });
    await userEvent.click(await screen.findByRole('radio', { name: 'Draw' }));
    const node = screen.getByTestId('review-canvas-surface');
    vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 })
    );
    fireEvent.pointerDown(node, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 50, clientY: 20, pointerId: 1 });
    await userEvent.click(
      screen.getByRole('button', { name: 'Request changes' })
    );
    await waitFor(() => {
      const post = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => init?.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.[1]?.body));
      expect(body).toMatchObject({
        command: 'request_changes',
        revision: 'v1',
        pins: [],
        strokes: [
          {
            revision: 'v1',
            points: [
              [0.1, 0.1],
              [0.5, 0.2],
            ],
          },
        ],
      });
    });
  });
});
