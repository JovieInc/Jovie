import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockAcquireRecentDispatch = vi.hoisted(() => vi.fn());
const mockClearRecentDispatch = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    LINEAR_WEBHOOK_SECRET: 'linear-secret',
    GH_DISPATCH_TOKEN: 'gh-token',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/http/server-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/http/server-fetch')
  >('@/lib/http/server-fetch');
  return {
    ...actual,
    serverFetch: mockServerFetch,
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  acquireRecentDispatch: mockAcquireRecentDispatch,
  clearRecentDispatch: mockClearRecentDispatch,
}));

function sign(body: string): string {
  return createHmac('sha256', 'linear-secret').update(body).digest('hex');
}

function eventId(
  body: string,
  kind: 'plan' | 'triage-assess' | 'validation-receipt' | 'quality-gap-input'
): string {
  return `${sign(body)}:${kind}`;
}

function planReadyPayload(webhookId?: string) {
  return {
    type: 'Comment',
    action: 'create',
    createdAt: '2026-03-10T00:00:00.000Z',
    webhookId,
    data: {
      id: 'comment_123',
      body: 'coderabbit-plan-ready verify_required=true',
      user: { name: 'CodeRabbit' },
      issue: {
        id: 'issue_123',
        identifier: 'JOV-123',
        updatedAt: '2026-03-10T00:00:01.000Z',
        state: { name: 'Todo' },
        team: { key: 'JOV' },
      },
    },
  };
}

describe('POST /api/webhooks/linear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns deduplicated response when a recent dispatch exists', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'duplicate',
    });

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      received: true,
      deduplicated: true,
      eventId: eventId(body, 'plan'),
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
  });

  it('returns 503 when webhook dedupe backend is unavailable', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'backend_unavailable',
    });

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Webhook dedupe unavailable',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dedupe backend unavailable',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        issueId: 'issue_123',
      })
    );
  });

  it('holds an ambiguous timeout for reconciliation without replay', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError('timed out', 4500, 'Linear dispatch')
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data).toEqual({
      received: true,
      dispatchState: 'ambiguous',
      reconcileRequired: true,
      eventId: eventId(body, 'plan'),
    });
    expect(mockClearRecentDispatch).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Linear webhook dispatch timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/webhooks/linear',
        timeoutMs: 4500,
      })
    );
  });

  it('does not retry the GitHub dispatch POST', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(
      new Response(null, {
        status: 204,
      })
    );

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload();
    const body = JSON.stringify(payload);
    const request = new Request('https://example.com/api/webhooks/linear', {
      method: 'POST',
      headers: {
        'linear-signature': sign(body),
      },
      body,
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/JovieInc/Jovie/dispatches',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 4500,
      })
    );
    expect(mockServerFetch.mock.calls[0]?.[1]).not.toHaveProperty('retry');
  });

  it('leaves JOV issue pickup to upstream OpenAI Symphony', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'create',
      createdAt: '2026-08-15T00:00:00.000Z',
      data: {
        id: 'issue_backlog',
        identifier: 'JOV-100',
        title: 'Bounded ordinary fix',
        updatedAt: '2026-08-15T00:00:00.000Z',
        team: { key: 'JOV' },
        state: { name: 'Backlog' },
      },
    };
    const body = JSON.stringify(payload);
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': sign(body) },
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(mockAcquireRecentDispatch).not.toHaveBeenCalled();
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('keeps plan-ready dispatches bounded and distinct from issue pickup', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = planReadyPayload('subscription-5306');
    const body = JSON.stringify(payload);
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: {
          'linear-signature': sign(body),
          'linear-delivery': 'linear-delivery-5306',
        },
        body,
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      eventId: eventId(body, 'plan'),
    });
    const dispatch = JSON.parse(mockServerFetch.mock.calls[0]?.[1]?.body);
    expect(Object.keys(dispatch.client_payload).length).toBeLessThanOrEqual(10);
    expect(dispatch.client_payload.delivery_id).toBe(sign(body));
    expect(dispatch.event_type).toBe('linear_plan_ready');
    expect(mockAcquireRecentDispatch).toHaveBeenCalledWith(
      'linear',
      eventId(body, 'plan'),
      21_600
    );
  });

  it('dispatches a signed JOV Triage change without issue content', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Issue',
      action: 'create',
      webhookId: 'subscription-one',
      data: {
        id: '68b3e8de-588e-46ba-8209-84329d154627',
        identifier: 'JOV-6500',
        title: 'Sensitive title',
        description: 'Sensitive description',
        updatedAt: '2026-09-24T00:00:00.000Z',
        teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
        stateId: '9844cfe6-6cf4-4347-842c-893a68f349b8',
      },
    };
    const body = JSON.stringify(payload);
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: {
          'linear-signature': sign(body),
          'linear-delivery': 'delivery-one',
        },
        body,
      }) as never
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dispatched: true,
      eventId: eventId(body, 'triage-assess'),
    });
    const dispatch = JSON.parse(mockServerFetch.mock.calls[0]?.[1]?.body);
    expect(dispatch.event_type).toBe('linear_triage_assess');
    expect(dispatch.client_payload).toMatchObject({
      delivery_id: sign(body),
      issue_identifier: 'JOV-6500',
      team_key: 'JOV',
      state_name: 'Triage',
      action: 'create',
    });
    expect(dispatch.client_payload).not.toHaveProperty('automation');
    expect(JSON.stringify(dispatch)).not.toContain('Sensitive');
    expect(mockAcquireRecentDispatch).toHaveBeenCalledWith(
      'linear',
      eventId(body, 'triage-assess'),
      21_600
    );
  });

  it('deduplicates a verified body replay even when its delivery header changes', async () => {
    mockAcquireRecentDispatch
      .mockResolvedValueOnce({ acquired: true, reason: 'acquired' })
      .mockResolvedValueOnce({ acquired: false, reason: 'duplicate' });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const body = JSON.stringify({
      type: 'Issue',
      action: 'update',
      webhookId: 'same-subscription',
      data: {
        id: '68b3e8de-588e-46ba-8209-84329d154627',
        identifier: 'JOV-6500',
        teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
        stateId: '9844cfe6-6cf4-4347-842c-893a68f349b8',
      },
    });
    for (const delivery of ['delivery-a', 'delivery-b']) {
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: {
            'linear-signature': sign(body),
            'linear-delivery': delivery,
          },
          body,
        }) as never
      );
      expect(response.status).toBe(200);
    }
    expect(mockAcquireRecentDispatch.mock.calls.map(call => call[1])).toEqual([
      eventId(body, 'triage-assess'),
      eventId(body, 'triage-assess'),
    ]);
    expect(mockServerFetch).toHaveBeenCalledTimes(1);
  });

  it('dispatches distinct signed issue revisions under the same subscription', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const bodies = ['2026-09-24T00:00:00.000Z', '2026-09-24T00:01:00.000Z'].map(
      updatedAt =>
        JSON.stringify({
          type: 'Issue',
          action: 'update',
          webhookId: 'same-subscription',
          data: {
            id: '68b3e8de-588e-46ba-8209-84329d154627',
            identifier: 'JOV-6500',
            teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
            stateId: '9844cfe6-6cf4-4347-842c-893a68f349b8',
            updatedAt,
          },
        })
    );
    for (const body of bodies) {
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: {
            'linear-signature': sign(body),
            'linear-delivery': 'same-header',
          },
          body,
        }) as never
      );
      expect(response.status).toBe(200);
    }
    expect(mockAcquireRecentDispatch.mock.calls.map(call => call[1])).toEqual(
      bodies.map(body => eventId(body, 'triage-assess'))
    );
    expect(mockServerFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores non-JOV and non-Triage Issue updates', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    for (const data of [
      {
        identifier: 'LYB-123',
        teamId: 'other-team',
        stateId: '9844cfe6-6cf4-4347-842c-893a68f349b8',
      },
      {
        identifier: 'JOV-123',
        teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
        stateId: 'other-state',
      },
    ]) {
      const body = JSON.stringify({
        type: 'Issue',
        action: 'update',
        data: { id: 'issue-123', ...data },
      });
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: { 'linear-signature': sign(body) },
          body,
        }) as never
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true, ignored: true });
    }
    expect(mockAcquireRecentDispatch).not.toHaveBeenCalled();
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('bridges a JOV validation receipt comment to the lifecycle re-evaluation', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const body = JSON.stringify({
      type: 'Comment',
      action: 'create',
      data: {
        id: 'comment-receipt',
        body: 'Validation receipt: outcome pass\n\n<!-- validation-receipt:v1\n{"schema":"jovie.validation-receipt/v1"}\n-->',
        user: { name: 'Jovie Bot' },
        issue: { id: 'issue-receipt', identifier: 'JOV-7001' },
      },
    });
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': sign(body) },
        body,
      }) as never
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dispatched: true,
      eventId: eventId(body, 'validation-receipt'),
    });
    const dispatch = JSON.parse(mockServerFetch.mock.calls[0]?.[1]?.body);
    expect(dispatch.event_type).toBe('linear_validation_receipt');
    expect(dispatch.client_payload).toMatchObject({
      issue_id: 'issue-receipt',
      issue_identifier: 'JOV-7001',
      action: 'create',
    });
  });

  it.each(['succeeded', 'denied'])(
    'wakes validation for a terminal founder %s result without accepting it',
    async terminalState => {
      mockAcquireRecentDispatch.mockResolvedValue({
        acquired: true,
        reason: 'acquired',
      });
      mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
      const { POST } = await import('@/app/api/webhooks/linear/route');
      const body = JSON.stringify({
        type: 'Comment',
        action: 'create',
        data: {
          id: 'founder-result',
          body: `Founder decision.\n\n\`\`\`json\n${JSON.stringify({ schema: 'jovie.work-result/v1', phase: 'terminal', actor: { class: 'founder-decision' }, terminalState })}\n\`\`\``,
          issue: { id: 'issue-receipt', identifier: 'JOV-7001' },
        },
      });
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: { 'linear-signature': sign(body) },
          body,
        }) as never
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ dispatched: true });
      expect(
        JSON.parse(mockServerFetch.mock.calls[0]?.[1]?.body)
      ).toMatchObject({
        event_type: 'linear_validation_receipt',
        client_payload: { issue_identifier: 'JOV-7001' },
      });
    }
  );

  it.each([
    {
      schema: 'jovie.work-result/v1',
      phase: 'progress',
      actor: { class: 'founder-decision' },
    },
    {
      schema: 'jovie.work-result/v1',
      phase: 'terminal',
      actor: { class: 'code-execution' },
    },
    { schema: 'jovie.work-result/v1', phase: 'terminal', actor: null },
  ])('ignores non-terminal or non-founder work results %j', async result => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const body = JSON.stringify({
      type: 'Comment',
      action: 'create',
      data: {
        body: `\`\`\`json\n${JSON.stringify(result)}\n\`\`\``,
        issue: { id: 'issue-receipt', identifier: 'JOV-7001' },
      },
    });
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': sign(body) },
        body,
      }) as never
    );
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('bridges a closed post-mortem action or escaped defect, or a gained defect label, to the quality gap scan', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockServerFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const { POST } = await import('@/app/api/webhooks/linear/route');
    for (const label of [
      'postmortem-action',
      'bug',
      'escaped-defect',
      'sentry',
    ]) {
      const body = JSON.stringify({
        type: 'Issue',
        action: 'update',
        updatedFrom: { stateId: 'in-progress' },
        data: {
          id: `issue-${label}`,
          identifier: 'JOV-7002',
          teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
          state: { id: 'done', name: 'Done', type: 'completed' },
          labels: [{ name: label }],
        },
      });
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: { 'linear-signature': sign(body) },
          body,
        }) as never
      );
      expect(await response.json()).toMatchObject({
        dispatched: true,
        eventId: eventId(body, 'quality-gap-input'),
      });
    }
    for (const exceptionLabel of ['dogfood', 'sentry']) {
      const gained = JSON.stringify({
        type: 'Issue',
        action: 'update',
        updatedFrom: { labelIds: ['label-feature'] },
        data: {
          id: `issue-gained-${exceptionLabel}`,
          identifier: 'JOV-7004',
          teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
          state: { id: 'todo', name: 'Todo', type: 'unstarted' },
          labels: [
            { id: 'label-feature', name: 'feature' },
            { id: `label-${exceptionLabel}`, name: exceptionLabel },
          ],
        },
      });
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: { 'linear-signature': sign(gained) },
          body: gained,
        }) as never
      );
      expect(await response.json()).toMatchObject({ dispatched: true });
    }
    expect(
      mockServerFetch.mock.calls.map(
        call => JSON.parse(call[1].body).event_type
      )
    ).toEqual(Array(6).fill('quality-gap-scan'));
  });

  it('ignores receipts off JOV, open defects, unlabeled closes, non-state edits, and kept labels', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const closed = { id: 'done', name: 'Done', type: 'completed' };
    const jov = {
      id: 'issue-x',
      identifier: 'JOV-7003',
      teamId: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
    };
    for (const payload of [
      {
        type: 'Comment',
        action: 'create',
        data: {
          body: '<!-- validation-receipt:v1\n{}\n-->',
          issue: { id: 'issue-lyb', identifier: 'LYB-1' },
        },
      },
      {
        type: 'Comment',
        action: 'create',
        data: {
          body: 'plain comment',
          issue: { id: 'issue-x', identifier: 'JOV-7003' },
        },
      },
      {
        type: 'Issue',
        action: 'update',
        updatedFrom: { stateId: 'todo' },
        data: {
          ...jov,
          state: { id: 'started', name: 'In Progress', type: 'started' },
          labels: [{ name: 'bug' }],
        },
      },
      {
        type: 'Issue',
        action: 'update',
        updatedFrom: { stateId: 'todo' },
        data: { ...jov, state: closed, labels: [{ name: 'feature' }] },
      },
      {
        type: 'Issue',
        action: 'update',
        updatedFrom: { title: 'old title' },
        data: { ...jov, state: closed, labels: [{ name: 'bug' }] },
      },
      {
        type: 'Issue',
        action: 'update',
        updatedFrom: { labelIds: ['label-bug'] },
        data: {
          ...jov,
          state: { id: 'todo', name: 'Todo', type: 'unstarted' },
          labels: [
            { id: 'label-bug', name: 'bug' },
            { id: 'label-p1', name: 'p1' },
          ],
        },
      },
    ]) {
      const body = JSON.stringify(payload);
      const response = await POST(
        new Request('https://example.com/api/webhooks/linear', {
          method: 'POST',
          headers: { 'linear-signature': sign(body) },
          body,
        }) as never
      );
      expect(await response.json()).toEqual({ received: true, ignored: true });
    }
    expect(mockServerFetch).not.toHaveBeenCalled();
  });
});
