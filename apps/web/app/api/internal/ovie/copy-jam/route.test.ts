import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  oidc: vi.fn(),
  save: vi.fn(),
  verdicts: vi.fn(),
  alts: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: mocks.oidc,
}));
vi.mock('@/lib/copy-jam/alternatives.server', () => ({
  saveAlternatives: mocks.save,
  listAlternatives: mocks.alts,
}));
vi.mock('@/lib/copy-jam/verdicts.server', () => ({
  listCopyVerdicts: mocks.verdicts,
}));

import { COPY_ROWS } from '@/lib/copy-jam/inventory';
import { GET, POST } from './route';

const id = COPY_ROWS[0]!.id;
const get = (q = '') =>
  GET(new Request(`https://jov.ie/api/internal/ovie/copy-jam${q}`));
const post = (body: unknown) =>
  POST(
    new Request('https://jov.ie/api/internal/ovie/copy-jam', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );

describe('/api/internal/ovie/copy-jam', () => {
  beforeEach(() => {
    mocks.oidc.mockReset().mockResolvedValue(true);
    mocks.save.mockReset();
    mocks.alts.mockReset().mockResolvedValue(new Map());
    mocks.verdicts.mockReset().mockResolvedValue(
      new Map([
        [
          id,
          {
            copyId: id,
            verdict: 'sucks',
            note: 'too long',
            text: COPY_ROWS[0]!.text,
            by: 't',
            source: 'ovie-tap',
            at: '',
            history: [],
          },
        ],
      ])
    );
  });

  it('rejects callers that are not Summer', async () => {
    mocks.oidc.mockResolvedValue(false);
    expect((await get()).status).toBe(401);
    expect((await post({})).status).toBe(401);
  });

  it('serves the rewrite queue, examples and stats', async () => {
    expect(
      ((await (await get()).json()) as { tasks: Array<{ copyId: string }> })
        .tasks[0]?.copyId
    ).toBe(id);
    expect(
      ((await (await get('?view=examples')).json()) as { avoid: unknown[] })
        .avoid
    ).toHaveLength(1);
    expect(
      ((await (await get('?view=stats')).json()) as { reviewed: number })
        .reviewed
    ).toBe(1);
    expect((await get('?view=nope')).status).toBe(400);
  });

  it('stores 2-3 alternatives and surfaces lint blocks and unknown IDs', async () => {
    mocks.save.mockResolvedValueOnce({ ok: true, record: { copyId: id } });
    expect(
      (await post({ copyId: id, alternatives: ['one', 'two'] })).status
    ).toBe(201);
    mocks.save.mockResolvedValueOnce({
      ok: false,
      error: 'lint_blocked',
      findings: [{ index: 0, rule: 'r', message: 'm' }],
    });
    expect(
      (await post({ copyId: id, alternatives: ['one', 'two'] })).status
    ).toBe(422);
    mocks.save.mockResolvedValueOnce({ ok: false, error: 'unknown_copy_id' });
    expect(
      (await post({ copyId: 'ZZ-1', alternatives: ['one', 'two'] })).status
    ).toBe(404);
    expect(
      (await post({ copyId: id, alternatives: ['only one'] })).status
    ).toBe(400);
  });
});
