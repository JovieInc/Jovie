import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestSummerReconcile,
  SummerReconcileSection,
} from './SummerReconcileSection';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestSummerReconcile', () => {
  it('returns a persisted receipt when the endpoint confirms a new receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          persisted: 'created',
          result: { eventId: 'evt-123' },
        }),
        { status: 200 }
      )
    );

    const receipt = await requestSummerReconcile(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith('/api/ovie/summer/reconcile', {
      method: 'GET',
      cache: 'no-store',
    });
    expect(receipt).toEqual({
      kind: 'persisted',
      persisted: 'created',
      eventId: 'evt-123',
    });
  });

  it('reports existing receipts as already persisted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          persisted: 'existing',
          result: { eventId: 'evt-456' },
        }),
        { status: 200 }
      )
    );

    const receipt = await requestSummerReconcile(fetchMock);

    expect(receipt).toEqual({
      kind: 'persisted',
      persisted: 'existing',
      eventId: 'evt-456',
    });
  });

  it('maps server denials to a denied receipt with the server code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, code: 'founder_access_required' }),
          { status: 403 }
        )
      );

    const receipt = await requestSummerReconcile(fetchMock);

    expect(receipt).toEqual({
      kind: 'denied',
      code: 'founder_access_required',
      status: 403,
    });
  });

  it('denies with request_failed when the fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));

    const receipt = await requestSummerReconcile(fetchMock);

    expect(receipt).toEqual({
      kind: 'denied',
      code: 'request_failed',
      status: 0,
    });
  });
});

describe('SummerReconcileSection', () => {
  it('renders the read-only state when no recovery is indicated', () => {
    render(<SummerReconcileSection indicated={false} />);

    expect(
      screen.getByText(/No recovery indicated for this task/)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('summer-reconcile-request')
    ).not.toBeInTheDocument();
  });

  it('requests reconcile and renders the persisted receipt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            persisted: 'created',
            result: { eventId: 'evt-789' },
          }),
          { status: 200 }
        )
      )
    );

    render(<SummerReconcileSection indicated />);
    fireEvent.click(screen.getByTestId('summer-reconcile-request'));

    await waitFor(() =>
      expect(screen.getByTestId('summer-reconcile-receipt')).toBeInTheDocument()
    );
    expect(screen.getByText('Recorded')).toBeInTheDocument();
    expect(screen.getByText('evt-789')).toBeInTheDocument();
  });

  it('renders the denial message when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: false, code: 'production_origin_required' }),
            { status: 403 }
          )
        )
    );

    render(<SummerReconcileSection indicated />);
    fireEvent.click(screen.getByTestId('summer-reconcile-request'));

    await waitFor(() =>
      expect(screen.getByTestId('summer-reconcile-denial')).toBeInTheDocument()
    );
    expect(
      screen.getByText(/only runs from the production origin/)
    ).toBeInTheDocument();
  });
});
