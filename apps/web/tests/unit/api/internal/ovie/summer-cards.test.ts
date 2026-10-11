import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  humanServiceAcceptedReceiptFixture as humanServiceAcceptance,
  humanServiceOutcomeFixture as humanServiceOutcome,
  humanServiceRequestFixture as humanServiceRequest,
} from '@/tests/fixtures/human-service-pilot';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  submit: vi.fn(),
  getCard: vi.fn(),
  list: vi.fn(),
  recordGet: vi.fn(),
  recordSetIfAbsent: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  submitSummerCard: hoisted.submit,
  getSummerCard: hoisted.getCard,
  listSummerCards: hoisted.list,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: hoisted.recordGet,
    setIfAbsent: hoisted.recordSetIfAbsent,
  }),
}));

const { GET, POST } = await import(
  '@/app/api/internal/ovie/summer-cards/route'
);
const {
  buildHumanServiceCaseBinding,
  buildHumanServiceOutcomeReceipt,
  evaluateHumanServiceRequest,
} = await import('@/lib/ovie/human-service-pilot');
const { summerCardId } = await import('@/lib/ovie/summer-cards');

const URL_BASE = 'https://jov.ie/api/internal/ovie/summer-cards';

const input = {
  idempotencyKey: 'outreach-2026-09-26',
  kind: 'outbound',
  product: 'jov',
  title: 'Email 12 claimed artists',
  body: 'Hi, your Jovie profile is live.',
  recommendation: 'Send it',
  recipient: 'claimed artists',
  evidence: ['https://jov.ie/app/ov/growth'],
};

const card = {
  id: 'sc_0123456789abcdef0123456789abcdef',
  ...input,
  defaultIfSilent: null,
  amountUsd: null,
  status: 'pending',
  comment: null,
  createdAt: '2026-09-26T10:00:00.000Z',
  decidedAt: null,
};

function post(body: unknown): Request {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/internal/ovie/summer-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
    hoisted.recordSetIfAbsent.mockResolvedValue(true);
  });

  it('returns 401 without touching the store when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await POST(post(input));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(hoisted.submit).not.toHaveBeenCalled();
  });

  it('creates a card with 201', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'created', card });
    const response = await POST(post(input));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ card });
    expect(hoisted.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: input.idempotencyKey,
        defaultIfSilent: null,
        amountUsd: null,
      })
    );
  });

  it('replays an identical submission with 200 and the existing card', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'replayed', card });
    const response = await POST(post(input));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ card });
  });

  it('routes a request to Tim and accepts only its decided card', async () => {
    const serviceRequest = humanServiceRequest();
    const admission = evaluateHumanServiceRequest(serviceRequest);
    const serviceCard = {
      id: 'sc_0123456789abcdef0123456789abcdef',
      ...admission.operatorCard!,
      status: 'pending',
      comment: null,
      createdAt: '2026-10-02T20:00:00.000Z',
      decidedAt: null,
    };
    hoisted.submit.mockResolvedValue({
      outcome: 'created',
      card: serviceCard,
    });

    const response = await POST(post(serviceRequest));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      pilot: {
        caseId: admission.caseId,
        status: 'requested',
        disposition: 'needs_operator_decision',
      },
      card: { recipient: 'Tim', status: 'pending' },
    });
    expect(hoisted.recordSetIfAbsent).toHaveBeenNthCalledWith(
      1,
      `human-service-case:${admission.caseId}`,
      buildHumanServiceCaseBinding(admission.source),
      0
    );
    expect(hoisted.recordSetIfAbsent).toHaveBeenNthCalledWith(
      2,
      `human-service-request:${admission.id}`,
      admission,
      0
    );
    expect(hoisted.submit).toHaveBeenCalledWith(admission.operatorCard);

    const acceptedRequest = humanServiceRequest({
      source: { ...serviceRequest.source, revision: '2' },
      operatorDecision: {
        decision: 'accepted',
        decisionId: summerCardId(admission.caseId),
        decidedBy: 'tim',
        decidedAt: '2026-10-02T20:00:00.000Z',
        ownerId: 'tim',
        reason: null,
      },
    });
    hoisted.getCard.mockResolvedValue({
      ...serviceCard,
      id: summerCardId(admission.caseId),
      idempotencyKey: admission.caseId,
      status: 'approved',
      decidedAt: '2026-10-02T20:00:00.000Z',
    });

    const accepted = await POST(post(acceptedRequest));

    expect(accepted.status).toBe(201);
    await expect(accepted.json()).resolves.toMatchObject({
      pilot: { caseId: admission.caseId, status: 'accepted' },
      card: null,
    });
    expect(hoisted.getCard).toHaveBeenCalledWith(
      summerCardId(admission.caseId)
    );
  });

  it('replays the same human-service request without duplicating the case or card', async () => {
    const serviceRequest = humanServiceRequest();
    const admission = evaluateHumanServiceRequest(serviceRequest);
    const binding = buildHumanServiceCaseBinding(admission.source);
    const reorderedAdmission = Object.fromEntries(
      Object.entries(admission).reverse()
    );
    hoisted.recordSetIfAbsent.mockResolvedValue(false);
    hoisted.recordGet.mockImplementation(async key =>
      String(key).startsWith('human-service-case:')
        ? binding
        : reorderedAdmission
    );
    hoisted.submit.mockResolvedValue({
      outcome: 'replayed',
      card: {
        id: 'sc_0123456789abcdef0123456789abcdef',
        ...admission.operatorCard!,
        status: 'pending',
        comment: null,
        createdAt: '2026-10-02T20:00:00.000Z',
        decidedAt: null,
      },
    });

    const response = await POST(post(serviceRequest));

    expect(response.status).toBe(200);
    expect(hoisted.recordSetIfAbsent).toHaveBeenCalledTimes(2);
    expect(hoisted.submit).toHaveBeenCalledOnce();
  });

  it('records delivery only for the accepted owner and tenant-scoped case', async () => {
    const admission = evaluateHumanServiceRequest(humanServiceRequest());
    const acceptance = humanServiceAcceptance();
    const serviceOutcome = humanServiceOutcome();
    const outcomeReceipt = buildHumanServiceOutcomeReceipt(serviceOutcome);
    hoisted.recordGet.mockImplementation(async key =>
      String(key).startsWith('human-service-case:')
        ? buildHumanServiceCaseBinding(admission.source)
        : acceptance
    );

    const response = await POST(post(serviceOutcome));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ outcome: outcomeReceipt });
    expect(hoisted.recordSetIfAbsent).toHaveBeenCalledWith(
      `human-service-outcome:${outcomeReceipt.id}`,
      outcomeReceipt,
      0
    );
    expect(hoisted.submit).not.toHaveBeenCalled();
  });

  it('rejects delivery without the exact accepted request revision', async () => {
    const admission = evaluateHumanServiceRequest(humanServiceRequest());
    hoisted.recordGet.mockImplementation(async key =>
      String(key).startsWith('human-service-case:')
        ? buildHumanServiceCaseBinding(admission.source)
        : admission
    );

    const response = await POST(post(humanServiceOutcome()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'human_service_acceptance_mismatch',
    });
    expect(hoisted.recordSetIfAbsent).not.toHaveBeenCalled();
  });

  it('rejects an outcome attached to a different tenant', async () => {
    hoisted.recordGet.mockResolvedValue(
      buildHumanServiceCaseBinding(humanServiceRequest().source)
    );
    const serviceOutcome = {
      ...humanServiceOutcome(),
      tenantId: 'tenant_2',
    };

    const response = await POST(post(serviceOutcome));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'human_service_case_mismatch',
    });
    expect(hoisted.recordSetIfAbsent).not.toHaveBeenCalled();
  });

  it('returns 409 when the key was used for a different payload', async () => {
    hoisted.submit.mockResolvedValue({ outcome: 'conflict' });
    const response = await POST(post(input));
    expect(response.status).toBe(409);
  });

  it.each([
    ['bad key', { ...input, idempotencyKey: 'short' }],
    ['unknown kind', { ...input, kind: 'deploy' }],
    ['http evidence', { ...input, evidence: ['http://jov.ie'] }],
    [
      'too much evidence',
      { ...input, evidence: Array(17).fill('https://jov.ie') },
    ],
    ['negative spend', { ...input, amountUsd: -1 }],
    [
      'spend without intent preflight',
      {
        ...input,
        kind: 'spend',
        preflightReceiptId: 'spf_0123456789abcdef0123456789abcdef',
      },
    ],
    ['unknown field', { ...input, send: true }],
  ])('rejects %s with 422', async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(422);
    expect(hoisted.submit).not.toHaveBeenCalled();
  });

  it('rejects bodies over 32 KB with 413', async () => {
    const response = await POST(post({ ...input, body: 'x'.repeat(33_000) }));
    expect(response.status).toBe(413);
  });

  it('fails closed with 503 when the store throws', async () => {
    hoisted.submit.mockRejectedValue(new Error('db down'));
    const response = await POST(post(input));
    expect(response.status).toBe(503);
  });
});

describe('GET /api/internal/ovie/summer-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await GET(new Request(URL_BASE));
    expect(response.status).toBe(401);
    expect(hoisted.list).not.toHaveBeenCalled();
  });

  it('lists cards with the parsed filters', async () => {
    hoisted.list.mockResolvedValue([card]);
    const response = await GET(
      new Request(
        `${URL_BASE}?status=decided&since=2026-09-01T00:00:00.000Z&limit=10`
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cards: [card] });
    expect(hoisted.list).toHaveBeenCalledWith({
      status: 'decided',
      since: '2026-09-01T00:00:00.000Z',
      limit: 10,
    });
  });

  it('defaults to pending cards', async () => {
    hoisted.list.mockResolvedValue([]);
    await GET(new Request(URL_BASE));
    expect(hoisted.list).toHaveBeenCalledWith({ status: 'pending', limit: 50 });
  });

  it('rejects a limit over 100', async () => {
    const response = await GET(new Request(`${URL_BASE}?limit=101`));
    expect(response.status).toBe(400);
  });
});
