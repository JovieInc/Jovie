import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { boardMock } = vi.hoisted(() => ({ boardMock: vi.fn() }));

vi.mock('@vercel/board', () => ({ board: boardMock }));

import { mirrorEnabled } from './access';
import { POST } from './route';

const SECRET = 'pilot-hmac-secret-0123456789abcdef';

function sign(
  rawBody: string,
  timestamp = String(Date.now()),
  secret = SECRET
) {
  return {
    timestamp,
    signature: createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex'),
  };
}

function requestBody() {
  return JSON.stringify({
    rows: [
      {
        stageId: 12,
        taskId: 'fc-1',
        type: 'task',
        title: 'Fact-check deck',
        poster: 'summer',
        assignee: null,
        caps: ['research'],
        parent: null,
        status: 'open',
        actor: 'summer',
        stage: 'posted',
        at: Date.now(),
      },
    ],
  });
}

function post(
  rawBody: string,
  headers: Record<string, string> = {}
): Promise<Response> {
  return POST(
    new Request('https://jov.ie/api/internal/mesh-board-mirror', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

describe('POST /api/internal/mesh-board-mirror', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VERCEL_ENV = 'production';
    process.env.BOARD_MIRROR_SECRET = SECRET;
    boardMock.mockImplementation(() => {
      throw new Error('board() must not be reached before auth passes');
    });
  });

  it('404s unless production AND the secret is set', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(mirrorEnabled()).toBe(false);
    process.env.VERCEL_ENV = 'production';
    expect(mirrorEnabled()).toBe(true);
    delete process.env.BOARD_MIRROR_SECRET;
    expect(mirrorEnabled()).toBe(false);
    process.env.BOARD_MIRROR_SECRET = SECRET;
  });

  it('404s on a non-production request before reading the body', async () => {
    process.env.VERCEL_ENV = 'preview';
    const response = await post(requestBody());
    expect(response.status).toBe(404);
    expect(boardMock).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed batch and returns processedThrough', async () => {
    const rawBody = requestBody();
    const { timestamp, signature } = sign(rawBody);
    const applied: number[] = [];
    boardMock.mockImplementation(() => ({
      as: () => ({
        tasks: {
          create: async (...args: unknown[]) => {
            applied.push(
              (args[1] as { id: string }).id === 'hub-stage-12' ? 1 : 0
            );
            return { task: { id: 'msg_1' } };
          },
        },
        post: async () => ({ id: 'msg_2' }),
        reply: async () => ({ id: 'msg_3' }),
        label: async () => ({ ok: true }),
        messages: async () => ({ messages: [], cursor: '' }),
        tasks_list: undefined,
      }),
    }));
    const response = await post(rawBody, {
      'x-mesh-timestamp': timestamp,
      'x-mesh-signature': signature,
    });
    expect(response.status).toBe(200);
    const out = (await response.json()) as {
      ok: boolean;
      processedThrough: number;
    };
    expect(out.ok).toBe(true);
    expect(out.processedThrough).toBe(12);
    expect(applied).toEqual([1]);
  });

  it('rejects a bad signature', async () => {
    const rawBody = requestBody();
    const { timestamp } = sign(rawBody);
    const response = await post(rawBody, {
      'x-mesh-timestamp': timestamp,
      'x-mesh-signature': 'a'.repeat(64),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe(
      'bad_signature'
    );
    expect(boardMock).not.toHaveBeenCalled();
  });

  it('rejects a timestamp outside the ±300 s window', async () => {
    const rawBody = requestBody();
    const stale = String(Date.now() - 301_000);
    const { signature } = sign(rawBody, stale);
    const response = await post(rawBody, {
      'x-mesh-timestamp': stale,
      'x-mesh-signature': signature,
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe(
      'timestamp_skew'
    );
    // 299 s ago is inside the window: auth passes and the row is applied.
    const edge = String(Date.now() - 299_000);
    const { signature: edgeSig } = sign(rawBody, edge);
    boardMock.mockImplementation(() => ({
      as: () => ({
        tasks: {
          create: async () => ({ task: { id: 'msg_1' } }),
        },
        post: async () => ({ id: 'msg_2' }),
        reply: async () => ({ id: 'msg_3' }),
        label: async () => ({ ok: true }),
        messages: async () => ({ messages: [], cursor: '' }),
      }),
    }));
    const ok = await post(rawBody, {
      'x-mesh-timestamp': edge,
      'x-mesh-signature': edgeSig,
    });
    expect(ok.status).toBe(200);
  });

  it('rejects malformed rows after auth', async () => {
    const rawBody = JSON.stringify({ rows: [{ stageId: 'x' }] });
    const { timestamp, signature } = sign(rawBody);
    const response = await post(rawBody, {
      'x-mesh-timestamp': timestamp,
      'x-mesh-signature': signature,
    });
    expect(response.status).toBe(400);
    expect(boardMock).not.toHaveBeenCalled();
  });

  it('a row that throws is logged and skipped; processedThrough still advances', async () => {
    const rawBody = JSON.stringify({
      rows: [
        {
          stageId: 3,
          taskId: 'a',
          type: 'task',
          title: 'A',
          poster: 'summer',
          assignee: null,
          caps: [],
          parent: null,
          status: 'open',
          actor: 'summer',
          stage: 'posted',
          at: Date.now(),
        },
        {
          stageId: 4,
          taskId: 'b',
          type: 'task',
          title: 'B',
          poster: 'summer',
          assignee: null,
          caps: [],
          parent: null,
          status: 'open',
          actor: 'summer',
          stage: 'posted',
          at: Date.now(),
        },
      ],
    });
    const { timestamp, signature } = sign(rawBody);
    boardMock.mockImplementation(() => ({
      as: () => ({
        tasks: {
          create: async (...createArgs: unknown[]) => {
            const input = createArgs[1] as { text: string };
            if (input.text === 'B') throw new Error('task_claimed');
            return { task: { id: 'msg_a' } };
          },
        },
        post: async () => ({ id: 'x' }),
        reply: async () => ({ id: 'y' }),
        label: async () => ({ ok: true }),
        messages: async () => ({ messages: [], cursor: '' }),
      }),
    }));
    const response = await post(rawBody, {
      'x-mesh-timestamp': timestamp,
      'x-mesh-signature': signature,
    });
    expect(response.status).toBe(200);
    const out = (await response.json()) as { processedThrough: number };
    expect(out.processedThrough).toBe(4);
  });
});
