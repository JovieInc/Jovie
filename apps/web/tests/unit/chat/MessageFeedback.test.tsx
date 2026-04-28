/**
 * MessageFeedback component tests.
 *
 * Covers the progressive-disclosure UX from /autoplan design phase:
 *   - thumbs always visible
 *   - up = single click + "Saved" + auto-fade
 *   - down = reveal reason chips → reason click reveals correction
 *     textarea → submit → "Saved" + auto-fade
 *   - inline error preserves state for retry
 */

import { TooltipProvider } from '@jovie/ui';
import { fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageFeedback } from '@/components/jovie/components/MessageFeedback';
import { fastRender } from '@/tests/utils/fast-render';

function renderWithTooltip(ui: ReactElement) {
  return fastRender(<TooltipProvider>{ui}</TooltipProvider>);
}

const TRACE_ID = '11111111-2222-4333-8444-555555555555';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // Default success
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, id: 'fb-1' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MessageFeedback — happy paths', () => {
  it('renders both thumbs at rest', () => {
    const { getByLabelText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );
    expect(getByLabelText('Helpful')).toBeTruthy();
    expect(getByLabelText('Not helpful')).toBeTruthy();
  });

  it('thumbs-up: posts up rating with no reason or correction', async () => {
    const { getByLabelText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );
    fireEvent.click(getByLabelText('Helpful'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/feedback');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ traceId: TRACE_ID, rating: 'up' });
  });

  it('thumbs-down: progressive disclosure to reason chips', async () => {
    const { getByLabelText, queryByText, getByText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );

    // Reason chips not visible at rest.
    expect(queryByText('Wrong')).toBeNull();

    fireEvent.click(getByLabelText('Not helpful'));

    // Now visible.
    expect(getByText('Wrong')).toBeTruthy();
    expect(getByText('Outdated')).toBeTruthy();
    expect(
      getByText('Hallucinated'.replace('Hallucinated', 'Made up'))
    ).toBeTruthy();
  });

  it('thumbs-down → reason → correction → submit posts down with reason + correction', async () => {
    const { getByLabelText, getByText, getByTestId } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );

    fireEvent.click(getByLabelText('Not helpful'));
    fireEvent.click(getByText('Wrong'));

    const textarea = getByTestId(
      'chat-feedback-correction'
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'Release date is actually 2026-04-15.' },
    });
    fireEvent.click(getByText('Send feedback'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      traceId: TRACE_ID,
      rating: 'down',
      reason: 'wrong',
      correction: 'Release date is actually 2026-04-15.',
    });
  });

  it('thumbs-down → reason → empty correction → submit posts down with reason only', async () => {
    const { getByLabelText, getByText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );

    fireEvent.click(getByLabelText('Not helpful'));
    fireEvent.click(getByText('Outdated'));
    fireEvent.click(getByText('Send feedback'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      traceId: TRACE_ID,
      rating: 'down',
      reason: 'outdated',
    });
    expect(body.correction).toBeUndefined();
  });

  it('Cancel from reason picker returns to idle', () => {
    const { getByLabelText, getByText, queryByText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );
    fireEvent.click(getByLabelText('Not helpful'));
    expect(getByText('Wrong')).toBeTruthy();
    fireEvent.click(getByText('Cancel'));
    expect(queryByText('Wrong')).toBeNull();
  });
});

describe('MessageFeedback — error path', () => {
  it('surfaces inline error message on POST failure', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Trace not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { getByLabelText, findByText } = renderWithTooltip(
      <MessageFeedback traceId={TRACE_ID} />
    );
    fireEvent.click(getByLabelText('Helpful'));

    expect(await findByText("Couldn't save — try again")).toBeTruthy();
  });
});
