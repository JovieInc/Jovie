import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/hud/ai-ops/dispatch/route';
import { HermesDispatchConfigurationError } from '@/lib/hermes/dispatch';

const mockAuthorizeHud = vi.hoisted(() => vi.fn());
const mockDispatchHermesWorker = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: mockAuthorizeHud,
}));

vi.mock('@/lib/hermes/dispatch', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/hermes/dispatch')>();
  return {
    ...actual,
    dispatchHermesWorker: mockDispatchHermesWorker,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/hud/ai-ops/dispatch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/hud/ai-ops/dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
    mockDispatchHermesWorker.mockResolvedValue({
      dispatchId: 'dispatch-1',
      branchName: 'codex/hermes-test',
      eventType: 'hermes_cli_worker',
      dryRun: true,
    });
  });

  it('rejects kiosk sessions', async () => {
    mockAuthorizeHud.mockResolvedValueOnce({ ok: true, mode: 'kiosk' });

    const response = await POST(postRequest({}));

    expect(response.status).toBe(403);
    expect(mockDispatchHermesWorker).not.toHaveBeenCalled();
  });

  it('dispatches admin requests', async () => {
    const response = await POST(
      postRequest({
        source: 'hermes',
        kind: 'investigation',
        runtime: 'codex-cli',
        dryRun: true,
      })
    );

    await expect(response.json()).resolves.toEqual({
      dispatched: true,
      dispatchId: 'dispatch-1',
      branchName: 'codex/hermes-test',
      eventType: 'hermes_cli_worker',
      dryRun: true,
    });
    expect(response.status).toBe(202);
  });

  it('returns unavailable when dispatch credentials are missing', async () => {
    mockDispatchHermesWorker.mockRejectedValueOnce(
      new HermesDispatchConfigurationError(
        'GH_DISPATCH_TOKEN is not configured.'
      )
    );

    const response = await POST(
      postRequest({
        source: 'hermes',
        kind: 'investigation',
        runtime: 'codex-cli',
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'GH_DISPATCH_TOKEN is not configured.',
    });
  });
});
