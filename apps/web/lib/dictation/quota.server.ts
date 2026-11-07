import 'server-only';
import { RateLimiter } from '@/lib/rate-limit/rate-limiter';
import { getRedis } from '@/lib/redis';
import { withTimeout } from '@/lib/resilience/primitives';
import { DICTATION_LIMITS } from './limits';

const tokenMints = new RateLimiter({
  name: 'Dictation token mints',
  limit: DICTATION_LIMITS.tokenMintsPerHour,
  window: '1 h',
  prefix: 'dictation:mint',
  requireRedis: true,
  trafficClass: 'authenticated',
  analytics: false,
  algorithm: 'sliding-window',
});

export async function checkDictationMintLimit(
  accountId: string
): Promise<'rate_limited' | 'provider-down' | null> {
  const result = await tokenMints.limit(accountId);
  return result.unavailable || result.degraded
    ? 'provider-down'
    : result.success
      ? null
      : 'rate_limited';
}

// Atomic cross-instance check-and-reserve. No client-reported refunds: a missing,
// forged or interrupted usage report cannot lower the charged audio reservation.
export const RESERVE_AUDIO_SCRIPT = `
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
local seconds = tonumber(ARGV[1])
if used + seconds > tonumber(ARGV[2]) then return 0 end
redis.call('INCRBY', KEYS[1], seconds)
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;
export async function reserveDictationAudio(
  accountId: string,
  seconds: number,
  now = Date.now()
): Promise<'dictation_cap_reached' | 'provider-down' | null> {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > DICTATION_LIMITS.maxSessionSeconds
  )
    return 'dictation_cap_reached';
  const redis = getRedis();
  if (!redis) return 'provider-down';
  const day = Math.floor(now / 86_400_000);
  try {
    const result = await withTimeout(
      redis.eval(
        RESERVE_AUDIO_SCRIPT,
        [`dictation:audio:${accountId}:${day}`],
        [seconds, DICTATION_LIMITS.dailyAudioSecondsPerAccount, 172800]
      ),
      { timeoutMs: 1500, context: 'dictation-quota' }
    );
    return result === 1
      ? null
      : result === 0
        ? 'dictation_cap_reached'
        : 'provider-down';
  } catch {
    return 'provider-down';
  }
}
