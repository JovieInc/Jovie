import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  selectRows: [] as unknown[][],
  updateReturningMock: vi.fn(),
  insertReturningMock: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: hoisted.requireAdmin,
}));

vi.mock('@/lib/db', () => {
  const makeSelectChain = () => {
    const chain = {
      from: () => chain,
      limit: async () => hoisted.selectRows.shift() ?? [],
    };
    return chain;
  };
  return {
    db: {
      select: vi.fn(() => makeSelectChain()),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: hoisted.updateReturningMock,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: hoisted.insertReturningMock,
        })),
      })),
    },
  };
});

vi.mock('@/lib/db/schema/investors', () => ({
  investorSettings: { id: 'id' },
}));

const { PUT } = await import('./route');

const url = 'https://jov.ie/api/admin/investors/settings';

function put(body: unknown) {
  return PUT(
    new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('PUT /api/admin/investors/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdmin.mockResolvedValue(null);
    hoisted.selectRows = [];
    hoisted.updateReturningMock.mockResolvedValue([
      { id: 'settings_1', raiseTarget: 650000 },
    ]);
  });

  it('updates portal settings with a valid payload', async () => {
    hoisted.selectRows.push([{ id: 'settings_1' }]);

    const response = await put({ raiseTarget: 650000, followupEnabled: true });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.raiseTarget).toBe(650000);
  });

  it('returns 400 for malformed payloads', async () => {
    for (const body of [
      { raiseTarget: '650K' },
      { followupEnabled: 'true' },
      { bookCallUrl: 42 },
      'not-an-object',
    ]) {
      const response = await put(body);
      expect(response.status).toBe(400);
      const parsed = await response.json();
      expect(parsed.error).toBe('Invalid request body');
    }
  });
});
