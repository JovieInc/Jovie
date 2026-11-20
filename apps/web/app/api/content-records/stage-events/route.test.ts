import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({
  value: { versions: [] as unknown[], events: [] as unknown[] },
}));
vi.mock('@/lib/content-records/store.server', () => ({
  getContentStageRows: vi.fn(async () => rows.value),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET } from './route';

describe('GET /api/content-records/stage-events', () => {
  beforeEach(() => {
    rows.value = {
      versions: [
        {
          id: 'v1',
          kind: 'site-chrome',
          recordKey: 'main',
          version: 1,
          author: 'user:secret-id',
          createdAt: new Date('2026-10-29T10:00:00Z'),
        },
      ],
      events: [
        {
          id: 'e1',
          kind: 'site-chrome',
          recordKey: 'main',
          action: 'publish',
          toVersionId: 'v1',
          actor: 'agent:summer',
          createdAt: new Date('2026-10-29T10:00:03Z'),
        },
      ],
    };
  });

  it('serves contract rows as NDJSON with actors and ids stripped', async () => {
    const response = await GET();
    expect(response.headers.get('content-type')).toContain('ndjson');
    const text = await response.text();
    const parsed = text.split('\n').map(line => JSON.parse(line));
    expect(parsed.map(r => [r.entityType, r.entityId, r.stage])).toEqual([
      ['marketing-change', 'site-chrome/main@1', 'data-edit'],
      ['marketing-change', 'site-chrome/main@1', 'data-live'],
    ]);
    expect(text).not.toContain('secret-id');
    expect(text).not.toContain('agent:summer');
    expect(text).not.toContain('"v1"');
  });
});
