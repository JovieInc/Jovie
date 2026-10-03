import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  conflict: vi.fn(),
  returning: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: mocks.values }) },
}));
vi.mock('@/lib/db/schema/feedback', () => ({ feedbackItems: { id: 'id' } }));

import { integrationRequestId, submitIntegrationSignal } from './requests';

const signal = {
  provider: 'New Service',
  capability: 'catalog_links',
  useCase: 'Find my music on this service.',
};
describe('integration request persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.mockReturnValue({ onConflictDoNothing: mocks.conflict });
    mocks.conflict.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([{ id: 'saved' }]);
  });
  it('uses stable tenant-scoped identities and distinguishes separate use cases', () => {
    const key = integrationRequestId(
      'a',
      'spotify',
      'catalog_links',
      'Import releases'
    );
    expect(key).toEqual(
      integrationRequestId('a', 'spotify', 'catalog_links', ' import releases ')
    );
    expect(key).not.toEqual(
      integrationRequestId('b', 'spotify', 'catalog_links', 'Import releases')
    );
    expect(key).not.toEqual(
      integrationRequestId('a', 'spotify', 'catalog_links', 'Match new tracks')
    );
  });
  it('persists the generated draft in the existing feedback store before acknowledging', async () => {
    expect(await submitIntegrationSignal('tenant', signal)).toMatchObject({
      kind: 'draft',
      duplicate: false,
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tenant',
        source: 'integration-builder',
        context: expect.objectContaining({
          build: expect.objectContaining({ kind: 'build' }),
        }),
      })
    );
    expect(mocks.conflict).toHaveBeenCalledWith({ target: 'id' });
  });
  it('returns an idempotent duplicate receipt across workers', async () => {
    mocks.returning.mockResolvedValue([]);
    expect(await submitIntegrationSignal('tenant', signal)).toMatchObject({
      kind: 'draft',
      duplicate: true,
    });
  });
  it('does not claim success after storage failure', async () => {
    mocks.returning.mockRejectedValue(new Error('database offline'));
    await expect(submitIntegrationSignal('tenant', signal)).rejects.toThrow(
      'database offline'
    );
  });
  it('does not create build work for capabilities already implemented', async () => {
    expect(
      await submitIntegrationSignal('tenant', {
        ...signal,
        provider: 'Spotify',
        capability: 'artist_import',
      })
    ).toMatchObject({ kind: 'existing' });
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
