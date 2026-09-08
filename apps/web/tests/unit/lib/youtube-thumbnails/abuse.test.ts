import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({
  getRedisClient: () => null,
  youtubeThumbnailPreviewBurstLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewChannelLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewCooldownLimiter: { limit: vi.fn() },
  youtubeThumbnailPreviewVisitorLimiter: { limit: vi.fn() },
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  isDatacenterAsn: vi.fn(() => false),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import type { RateLimitResult } from '@/lib/rate-limit';
import {
  assertGenerationCooldown,
  buildThumbnailVisitorKey,
  consumeGenerationAllowance,
  type GenerationBudgetGuards,
  PreviewAbuseError,
  parseThumbnailDeviceId,
} from '@/lib/youtube-thumbnails/abuse';

const allow = (remaining = 2): RateLimitResult => ({
  success: true,
  limit: 3,
  remaining,
  reset: new Date(Date.now() + 60_000),
});

const deny = (retryAfterSeconds: number): RateLimitResult => ({
  success: false,
  limit: 3,
  remaining: 0,
  reset: new Date(Date.now() + retryAfterSeconds * 1000),
});

function guards(overrides: Partial<GenerationBudgetGuards> = {}) {
  const g: GenerationBudgetGuards = {
    limitCooldown: vi.fn(async () => allow()),
    limitVisitor: vi.fn(async () => allow()),
    limitChannel: vi.fn(async () => allow()),
    ...overrides,
  };
  return {
    guards: g,
    limitCooldown: g.limitCooldown as ReturnType<typeof vi.fn>,
    limitVisitor: g.limitVisitor as ReturnType<typeof vi.fn>,
    limitChannel: g.limitChannel as ReturnType<typeof vi.fn>,
  };
}

describe('parseThumbnailDeviceId', () => {
  it('accepts a UUID-shaped device id', () => {
    expect(parseThumbnailDeviceId('6f1c9f0e-3b7a-4c2d-9e1a-2f4b6c8d0e1f')).toBe(
      '6f1c9f0e-3b7a-4c2d-9e1a-2f4b6c8d0e1f'
    );
  });

  it('rejects missing or malformed device ids (IP-only fallback)', () => {
    expect(parseThumbnailDeviceId(null)).toBeNull();
    expect(parseThumbnailDeviceId('')).toBeNull();
    expect(parseThumbnailDeviceId('short')).toBeNull();
    expect(parseThumbnailDeviceId('not a device id!')).toBeNull();
    expect(parseThumbnailDeviceId('x'.repeat(65))).toBeNull();
  });
});

describe('buildThumbnailVisitorKey', () => {
  it('hashes IP + device and never exposes the raw pair', () => {
    const key = buildThumbnailVisitorKey('203.0.113.9', 'device-abc-123');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('203.0.113.9');
    expect(key).not.toContain('device-abc-123');
  });

  it('changes with the device and falls back to IP-only', () => {
    const withDevice = buildThumbnailVisitorKey('203.0.113.9', 'device-a');
    const otherDevice = buildThumbnailVisitorKey('203.0.113.9', 'device-b');
    const ipOnly = buildThumbnailVisitorKey('203.0.113.9', null);
    expect(withDevice).not.toBe(otherDevice);
    expect(withDevice).not.toBe(ipOnly);
    expect(ipOnly).toBe(buildThumbnailVisitorKey('203.0.113.9', null));
  });
});

describe('assertGenerationCooldown', () => {
  it('passes when the cooldown limiter allows', async () => {
    const { guards: g } = guards();
    await expect(
      assertGenerationCooldown({ visitorKey: 'v' }, g)
    ).resolves.toBeUndefined();
  });

  it('throws cooldown with Retry-After when denied', async () => {
    const { guards: g } = guards({
      limitCooldown: vi.fn(async () => deny(42)),
    });
    const error = await assertGenerationCooldown({ visitorKey: 'v' }, g).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(PreviewAbuseError);
    expect((error as PreviewAbuseError).code).toBe('cooldown');
    expect((error as PreviewAbuseError).retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('consumeGenerationAllowance', () => {
  it('consumes visitor then channel and returns visitor remaining', async () => {
    const {
      guards: g,
      limitVisitor,
      limitChannel,
    } = guards({
      limitVisitor: vi.fn(async () => allow(1)),
    });
    const result = await consumeGenerationAllowance(
      { visitorKey: 'v', channelId: 'UCx' },
      g
    );
    expect(result.remaining).toBe(1);
    expect(limitVisitor).toHaveBeenCalledWith('v');
    expect(limitChannel).toHaveBeenCalledWith('UCx');
  });

  it('visitor cap wins first: channel cap is never consulted', async () => {
    const { guards: g, limitChannel } = guards({
      limitVisitor: vi.fn(async () => deny(3600)),
    });
    const error = await consumeGenerationAllowance(
      { visitorKey: 'v', channelId: 'UCx' },
      g
    ).catch((e: unknown) => e);
    expect((error as PreviewAbuseError).code).toBe('visitor_cap');
    expect(limitChannel).not.toHaveBeenCalled();
  });

  it('channel cap blocks when the visitor cap still has room', async () => {
    const { guards: g } = guards({
      limitChannel: vi.fn(async () => deny(7200)),
    });
    const error = await consumeGenerationAllowance(
      { visitorKey: 'v', channelId: 'UCx' },
      g
    ).catch((e: unknown) => e);
    expect((error as PreviewAbuseError).code).toBe('channel_cap');
    expect((error as PreviewAbuseError).retryAfterSeconds).toBeGreaterThan(0);
  });
});
