import type { RecordBackend } from '@/lib/ovie/mcp/store';
import type { FounderWelcomeLedger } from './runner';

/** setIfAbsent ttl: effectively permanent (the Postgres backend ignores it). */
const FOREVER_S = 10 * 365 * 24 * 3600;
const SENT = 'founder-welcome:sent:';
/**
 * A claim still `sending` after this long belongs to a run that died before
 * releasing it. Reclaiming is safe: the retry reuses the card's idempotency
 * key, which the email provider dedupes for 24 hours.
 */
const STALE_SENDING_MS = 15 * 60 * 1000;

type Slot =
  | { readonly state: 'sending'; readonly at: string }
  | { readonly state: 'released'; readonly at: string }
  | { readonly state: 'sent'; readonly at: string };

/**
 * One welcome per waitlist entry, ever. A send that did not go out (stream
 * paused, card no longer approved, provider down) releases its claim so a
 * later run can try again. A sent claim is never taken twice; an in-flight
 * claim is taken over only once it is stale (its run crashed or timed out).
 */
export function createFounderWelcomeLedger(
  backend: RecordBackend
): FounderWelcomeLedger {
  const key = (entryId: string) => `${SENT}${entryId}`;
  return {
    async reserve(entryId, now) {
      const sending: Slot = { state: 'sending', at: now.toISOString() };
      if (await backend.setIfAbsent(key(entryId), sending, FOREVER_S)) {
        return true;
      }
      const current = (await backend.get(key(entryId))) as Slot | null;
      const stale =
        current?.state === 'sending' &&
        now.getTime() - Date.parse(current.at) > STALE_SENDING_MS;
      if (current?.state !== 'released' && !stale) return false;
      return backend.compareAndSet(key(entryId), current, sending, FOREVER_S);
    },
    async release(entryId, now) {
      const current = (await backend.get(key(entryId))) as Slot | null;
      if (current?.state !== 'sending') return;
      const released: Slot = { state: 'released', at: now.toISOString() };
      await backend.compareAndSet(key(entryId), current, released, FOREVER_S);
    },
    async markSent(entryId, now) {
      const done: Slot = { state: 'sent', at: now.toISOString() };
      await backend.set(key(entryId), done);
    },
  };
}
