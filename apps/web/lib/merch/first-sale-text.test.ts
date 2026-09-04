import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirstSaleTextDeps } from './first-sale-text';
import {
  FIRST_SALE_TEXT_COPY,
  isPriorMerchSaleStatus,
  maybeNotifyFirstMerchSale,
} from './first-sale-text';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/env-server', () => ({
  env: { FIRST_SALE_TEXT_LIVE: undefined },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const INPUT = {
  creatorProfileId: '11111111-1111-1111-1111-111111111111',
  merchOrderId: '22222222-2222-2222-2222-222222222222',
} as const;

function createDeps(overrides?: Partial<FirstSaleTextDeps>): FirstSaleTextDeps {
  const sendSms = overrides?.sendSms ?? vi.fn().mockResolvedValue(true);
  return {
    isLive: () => true,
    findPriorPaidSale: vi.fn().mockResolvedValue(null),
    claimFirstSale: vi.fn().mockResolvedValue(true),
    resolveArtistPhone: vi.fn().mockResolvedValue('+15551234567'),
    ...overrides,
    sendSms,
  };
}

describe('first-sale text copy', () => {
  it('stays one short GSM-7 message', () => {
    expect(FIRST_SALE_TEXT_COPY.body.length).toBeLessThanOrEqual(160);
    expect(FIRST_SALE_TEXT_COPY.body).toContain('first sale');
  });
});

describe('isPriorMerchSaleStatus', () => {
  it('treats successful paid orders as prior sales', () => {
    expect(isPriorMerchSaleStatus('paid')).toBe(true);
    expect(isPriorMerchSaleStatus('refunded')).toBe(false);
    expect(isPriorMerchSaleStatus('checkout_created')).toBe(false);
    expect(isPriorMerchSaleStatus('cancelled')).toBe(false);
  });
});

describe('maybeNotifyFirstMerchSale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the copy on the first paid sale when live', async () => {
    const deps = createDeps();

    const result = await maybeNotifyFirstMerchSale(INPUT, deps);

    expect(result.outcome).toBe('sent');
    expect(vi.mocked(deps.claimFirstSale)).toHaveBeenCalledWith(INPUT);
    expect(vi.mocked(deps.sendSms)).toHaveBeenCalledWith({
      creatorProfileId: INPUT.creatorProfileId,
      merchOrderId: INPUT.merchOrderId,
      phone: '+15551234567',
      body: FIRST_SALE_TEXT_COPY.body,
    });
  });

  it('is idempotent forever after the first claim', async () => {
    const deps = createDeps({
      claimFirstSale: vi.fn().mockResolvedValue(false),
    });

    const result = await maybeNotifyFirstMerchSale(INPUT, deps);

    expect(result.outcome).toBe('already_claimed');
    expect(vi.mocked(deps.sendSms)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.resolveArtistPhone)).not.toHaveBeenCalled();
  });

  it('does not send when FIRST_SALE_TEXT_LIVE is off', async () => {
    const deps = createDeps({
      isLive: () => false,
    });

    const result = await maybeNotifyFirstMerchSale(INPUT, deps);

    expect(result.outcome).toBe('dry_run');
    expect(vi.mocked(deps.claimFirstSale)).toHaveBeenCalledWith(INPUT);
    expect(vi.mocked(deps.sendSms)).not.toHaveBeenCalled();
  });

  it('does not send on a later sale', async () => {
    const deps = createDeps({
      findPriorPaidSale: vi.fn().mockResolvedValue('prior-order-id'),
    });

    const result = await maybeNotifyFirstMerchSale(INPUT, deps);

    expect(result.outcome).toBe('not_first_sale');
    expect(vi.mocked(deps.claimFirstSale)).not.toHaveBeenCalled();
    expect(vi.mocked(deps.sendSms)).not.toHaveBeenCalled();
  });

  it('claims once even when the artist has no phone', async () => {
    const deps = createDeps({
      resolveArtistPhone: vi.fn().mockResolvedValue(null),
    });

    const result = await maybeNotifyFirstMerchSale(INPUT, deps);

    expect(result.outcome).toBe('skipped_no_phone');
    expect(vi.mocked(deps.claimFirstSale)).toHaveBeenCalledWith(INPUT);
    expect(vi.mocked(deps.sendSms)).not.toHaveBeenCalled();
  });
});
