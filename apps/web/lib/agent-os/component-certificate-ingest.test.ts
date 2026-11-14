import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  setIfAbsent: vi.fn(),
  compareAndSet: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => mocks,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { warn: mocks.warn } }));

import { recordComponentCertificateDelivery } from './component-certificate-ingest';

const packet = {
  headSha: 'a'.repeat(40),
  deliveryOrder: {
    schema: 'jovie.source-order/v1',
    sourceOrdinal: 10,
    runNumber: 20,
    runAttempt: 1,
  },
  totals: { components: 10, certified: 2 },
};

describe('component certificate persistence boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.setIfAbsent.mockResolvedValue(true);
    mocks.compareAndSet.mockResolvedValue(true);
    mocks.set.mockResolvedValue(undefined);
  });
  it('writes latest only through CAS and caps the non-authoritative history at fifty', async () => {
    mocks.get.mockImplementation(async key =>
      key.endsWith(':history') ? Array(60).fill({ headSha: 'old' }) : null
    );
    const result = await recordComponentCertificateDelivery(packet);
    expect(result).toMatchObject({
      accepted: true,
      reason: 'stored',
      historyCount: 50,
      packet,
    });
    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      'component-certificate:latest',
      packet,
      expect.any(Number)
    );
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      'component-certificate:history',
      expect.arrayContaining([
        expect.objectContaining({ headSha: packet.headSha }),
      ])
    );
    expect(mocks.set.mock.calls[0][1]).toHaveLength(50);
  });
  it('does not create a history observation or lie about the stored SHA after rejection', async () => {
    const winner = {
      ...packet,
      headSha: 'b'.repeat(40),
      deliveryOrder: { ...packet.deliveryOrder, sourceOrdinal: 11 },
    };
    mocks.get.mockResolvedValue(winner);
    const result = await recordComponentCertificateDelivery(packet);
    expect(result).toMatchObject({
      accepted: false,
      reason: 'stale',
      historyCount: null,
      packet: winner,
    });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.compareAndSet).not.toHaveBeenCalled();
  });
  it('keeps an acknowledged atomic latest write successful if optional history fails', async () => {
    mocks.get.mockImplementation(async key => {
      if (key.endsWith(':history')) throw new Error('history unavailable');
      return null;
    });
    const result = await recordComponentCertificateDelivery(packet);
    expect(result).toMatchObject({
      accepted: true,
      reason: 'stored',
      historyCount: null,
      packet,
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('never touches history when the atomic latest write fails', async () => {
    mocks.get.mockResolvedValue(null);
    mocks.setIfAbsent.mockRejectedValue(new Error('latest unavailable'));
    await expect(recordComponentCertificateDelivery(packet)).rejects.toThrow(
      'latest unavailable'
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
