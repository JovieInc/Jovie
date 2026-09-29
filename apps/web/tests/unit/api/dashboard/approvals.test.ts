import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listProfileApprovals: vi.fn(),
  requestProfileApproval: vi.fn(),
  decideProfileApproval: vi.fn(),
  revokeProfileApproval: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (
    operation: (tx: Record<string, never>, userId: string) => Promise<unknown>
  ) => {
    const { userId } = await mocks.auth();
    if (!userId) throw new Error('Unauthorized');
    return operation({}, userId);
  },
}));

vi.mock('@/lib/team/approvals', () => ({
  listProfileApprovals: mocks.listProfileApprovals,
  requestProfileApproval: mocks.requestProfileApproval,
  decideProfileApproval: mocks.decideProfileApproval,
  revokeProfileApproval: mocks.revokeProfileApproval,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
  captureWarning: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: async (req: Request) => {
    try {
      return { ok: true, data: await req.json() };
    } catch {
      return { ok: false, response: null };
    }
  },
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

import {
  DELETE as decideDELETE,
  POST as decidePOST,
} from '@/app/api/dashboard/approvals/[id]/route';
import {
  GET as listGET,
  POST as requestPOST,
} from '@/app/api/dashboard/approvals/route';

const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PROFILE_ID = '00000000-0000-4000-8000-0000000000ee';
const APPROVAL_ID = '00000000-0000-4000-8000-0000000000ff';

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const routeContext = (id: string) => ({
  params: Promise.resolve({ id }),
});

describe('GET /api/dashboard/approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: USER_ID });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const res = await listGET(
      jsonRequest(
        `http://localhost/api/dashboard/approvals?profileId=${PROFILE_ID}`,
        'GET'
      )
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when profileId is missing', async () => {
    const res = await listGET(
      jsonRequest('http://localhost/api/dashboard/approvals', 'GET')
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('missing_params');
  });

  it('returns 403 when listing is forbidden', async () => {
    mocks.listProfileApprovals.mockResolvedValue({
      ok: false,
      reason: 'forbidden',
    });
    const res = await listGET(
      jsonRequest(
        `http://localhost/api/dashboard/approvals?profileId=${PROFILE_ID}`,
        'GET'
      )
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for invalid or missing profiles', async () => {
    mocks.listProfileApprovals.mockResolvedValue({
      ok: false,
      reason: 'invalid',
    });
    const res = await listGET(
      jsonRequest(
        'http://localhost/api/dashboard/approvals?profileId=bad',
        'GET'
      )
    );
    expect(res.status).toBe(404);
  });

  it('returns the approvals list', async () => {
    mocks.listProfileApprovals.mockResolvedValue({
      ok: true,
      approvals: [{ id: APPROVAL_ID }],
    });
    const res = await listGET(
      jsonRequest(
        `http://localhost/api/dashboard/approvals?profileId=${PROFILE_ID}`,
        'GET'
      )
    );
    expect(res.status).toBe(200);
    expect((await res.json()).approvals).toEqual([{ id: APPROVAL_ID }]);
  });

  it('returns 500 when the handler throws', async () => {
    mocks.listProfileApprovals.mockRejectedValue(new Error('db down'));
    const res = await listGET(
      jsonRequest(
        `http://localhost/api/dashboard/approvals?profileId=${PROFILE_ID}`,
        'GET'
      )
    );
    expect(res.status).toBe(500);
    expect(mocks.captureError).toHaveBeenCalled();
  });
});

describe('POST /api/dashboard/approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: USER_ID });
  });

  it('returns 400 for an invalid body', async () => {
    const res = await requestPOST(
      jsonRequest('http://localhost/api/dashboard/approvals', 'POST', {
        profileId: 'not-a-uuid',
        action: 'links.mutate',
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_body');
  });

  it('returns 400 for a non-risky action', async () => {
    const res = await requestPOST(
      jsonRequest('http://localhost/api/dashboard/approvals', 'POST', {
        profileId: PROFILE_ID,
        action: 'profile.rename',
      })
    );
    expect(res.status).toBe(400);
  });

  it('maps rejection reasons to statuses', async () => {
    const cases: Array<[string, number]> = [
      ['forbidden', 403],
      ['not_found', 404],
      ['not_needed', 409],
      ['invalid', 400],
    ];
    for (const [reason, status] of cases) {
      mocks.requestProfileApproval.mockResolvedValue({
        ok: false,
        reason,
      });
      const res = await requestPOST(
        jsonRequest('http://localhost/api/dashboard/approvals', 'POST', {
          profileId: PROFILE_ID,
          action: 'links.mutate',
        })
      );
      expect(res.status).toBe(status);
    }
  });

  it('returns 201 for a new request', async () => {
    mocks.requestProfileApproval.mockResolvedValue({
      ok: true,
      approvalId: APPROVAL_ID,
      alreadyPending: false,
    });
    const res = await requestPOST(
      jsonRequest('http://localhost/api/dashboard/approvals', 'POST', {
        profileId: PROFILE_ID,
        action: 'links.mutate',
        reason: 'please approve',
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).approvalId).toBe(APPROVAL_ID);
    expect(mocks.requestProfileApproval).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        appUserId: USER_ID,
        profileId: PROFILE_ID,
        action: 'links.mutate',
      })
    );
  });

  it('returns 200 when a request is already pending', async () => {
    mocks.requestProfileApproval.mockResolvedValue({
      ok: true,
      approvalId: APPROVAL_ID,
      alreadyPending: true,
    });
    const res = await requestPOST(
      jsonRequest('http://localhost/api/dashboard/approvals', 'POST', {
        profileId: PROFILE_ID,
        action: 'links.mutate',
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/dashboard/approvals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: USER_ID });
  });

  it('returns 400 for an invalid decision body', async () => {
    const res = await decidePOST(
      jsonRequest(
        `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
        'POST',
        { decision: 'maybe' }
      ),
      routeContext(APPROVAL_ID)
    );
    expect(res.status).toBe(400);
  });

  it('returns the decision on success', async () => {
    mocks.decideProfileApproval.mockResolvedValue({ ok: true });
    const res = await decidePOST(
      jsonRequest(
        `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
        'POST',
        { decision: 'approved', reason: 'fine' }
      ),
      routeContext(APPROVAL_ID)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('approved');
    expect(mocks.decideProfileApproval).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        approvalId: APPROVAL_ID,
        actorUserId: USER_ID,
        decision: 'approved',
      })
    );
  });

  it('maps decision failures to statuses', async () => {
    const cases: Array<[string, number]> = [
      ['forbidden', 403],
      ['not_found', 404],
      ['not_pending', 409],
      ['invalid', 400],
    ];
    for (const [reason, status] of cases) {
      mocks.decideProfileApproval.mockResolvedValue({ ok: false, reason });
      const res = await decidePOST(
        jsonRequest(
          `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
          'POST',
          { decision: 'rejected' }
        ),
        routeContext(APPROVAL_ID)
      );
      expect(res.status).toBe(status);
    }
  });
});

describe('DELETE /api/dashboard/approvals/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: USER_ID });
  });

  it('returns 200 on successful revocation', async () => {
    mocks.revokeProfileApproval.mockResolvedValue({ ok: true });
    const res = await decideDELETE(
      jsonRequest(
        `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
        'DELETE'
      ),
      routeContext(APPROVAL_ID)
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('revoked');
    expect(mocks.revokeProfileApproval).toHaveBeenCalledWith(
      {},
      { approvalId: APPROVAL_ID, actorUserId: USER_ID }
    );
  });

  it('maps revocation failures to statuses', async () => {
    const cases: Array<[string, number]> = [
      ['forbidden', 403],
      ['not_found', 404],
      ['not_pending', 409],
    ];
    for (const [reason, status] of cases) {
      mocks.revokeProfileApproval.mockResolvedValue({ ok: false, reason });
      const res = await decideDELETE(
        jsonRequest(
          `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
          'DELETE'
        ),
        routeContext(APPROVAL_ID)
      );
      expect(res.status).toBe(status);
    }
  });

  it('returns 500 when the handler throws', async () => {
    mocks.revokeProfileApproval.mockRejectedValue(new Error('db down'));
    const res = await decideDELETE(
      jsonRequest(
        `http://localhost/api/dashboard/approvals/${APPROVAL_ID}`,
        'DELETE'
      ),
      routeContext(APPROVAL_ID)
    );
    expect(res.status).toBe(500);
  });
});
