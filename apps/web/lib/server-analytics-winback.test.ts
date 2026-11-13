import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { insert: mocks.insert } }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { trackServerEvent } from './server-analytics';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

describe('winback analytics persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: 'event-1' }]);
    mocks.values.mockReturnValue({ returning: mocks.returning });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it('persists allowlisted winback properties without contact data', async () => {
    await trackServerEvent('winback_drafted', {
      entry_id: PROFILE_ID,
      capability_key: 'release_pages',
      batch_id: 'batch-1',
      template_version: 'winback-v1',
      winback_cohort: 'waitlisted',
      email: 'fan@example.com',
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'winback_drafted',
        category: 'winback',
        properties: {
          entry_id: PROFILE_ID,
          capability_key: 'release_pages',
          batch_id: 'batch-1',
          template_version: 'winback-v1',
          winback_cohort: 'waitlisted',
        },
      })
    );
  });

  it('drops malformed winback identifiers and unsafe tokens', async () => {
    await trackServerEvent('winback_drafted', {
      entry_id: 'fan@example.com',
      capability_key: 'release pages',
      batch_id: '+1 (415) 555-1212',
      template_version: 'x'.repeat(129),
      winback_cohort: 'waitlisted',
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ properties: { winback_cohort: 'waitlisted' } })
    );
  });
});
