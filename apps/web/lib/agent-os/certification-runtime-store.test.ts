import { expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';

const mocks = vi.hoisted(() => {
  const backend = { kind: 'postgres' };
  const store = {
    ingestPacket: vi.fn(async () => 'ingested'),
    projectReviewReady: vi.fn(async () => 'projected'),
    recordFounderDecision: vi.fn(async () => 'recorded'),
  };
  return {
    backend,
    postgresRecordBackend: vi.fn(() => backend),
    store,
    Store: vi.fn(function () {
      return store;
    }),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/agent-os/certification-adapter', () => ({
  MarketingCertificationStore: mocks.Store,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: mocks.postgresRecordBackend,
}));

import {
  getMarketingCertificationStore,
  ingestMarketingCertificationPacket,
  projectMarketingReviewReady,
  recordMarketingFounderDecision,
} from '@/lib/agent-os/certification-runtime-store';

it('constructs one Postgres registry store and forwards runtime operations', async () => {
  const store = getMarketingCertificationStore();
  expect(getMarketingCertificationStore()).toBe(store);
  expect(mocks.Store).toHaveBeenCalledWith(
    mocks.backend,
    MARKETING_COMPONENT_REGISTRY
  );
  expect(mocks.postgresRecordBackend).toHaveBeenCalledOnce();

  const packet = { subject: { id: 'section.hero' } } as never;
  await expect(
    ingestMarketingCertificationPacket(packet, '2026-09-05T07:59:00.000Z')
  ).resolves.toBe('ingested');
  expect(mocks.store.ingestPacket).toHaveBeenCalledWith(
    packet,
    '2026-09-05T07:59:00.000Z'
  );

  const projection = { existingEntryId: 'badge' };
  await expect(projectMarketingReviewReady(projection)).resolves.toBe(
    'projected'
  );
  expect(mocks.store.projectReviewReady).toHaveBeenCalledWith(projection);

  const decision = { subjectId: 'section.hero' } as never;
  await expect(recordMarketingFounderDecision(decision)).resolves.toBe(
    'recorded'
  );
  expect(mocks.store.recordFounderDecision).toHaveBeenCalledWith(decision);
});
