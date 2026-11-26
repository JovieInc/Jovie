import type { OvieTurnTiming } from '@/lib/ovie/chat-timing';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type { FastChatFetch } from '@/lib/ovie/summer-fast-speaker';
import { founderPrincipalHash } from '@/lib/ovie/summer-founder-auth';
import { openCurrentSummerSession } from '@/lib/ovie/summer-session';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';
import { getBoundSummerSpeaker } from '@/lib/ovie/summer-transport';

/**
 * Starts the Summer session history read so it overlaps the ingest writes.
 * Only for a turn that will really go live (speaker bound, stable turn id):
 * an invalid turn must never create a session row.
 */
export function prefetchSummerSession(input: {
  readonly live: boolean;
  readonly store: OperatingStore;
}) {
  if (!input.live || !getBoundSummerSpeaker()) return undefined;
  const session = openCurrentSummerSession(input.store);
  // A failure still surfaces where the turn awaits it.
  session.catch(() => undefined);
  return session;
}

/** The founder fast-path fetch, timed for the Server-Timing hops. */
export function createFounderFastChatFetch(
  userId: string,
  timing: OvieTurnTiming
): FastChatFetch {
  return async (chatBody, signal) => {
    timing.markSummerFetchStart();
    const response = await fetchSummerShadow('/ovie/v1/summer-chat/stream', {
      method: 'POST',
      body: JSON.stringify(chatBody),
      signal,
      headers: {
        'x-jovie-summer-principal-hash': founderPrincipalHash(userId),
      },
    });
    timing.markSummerConnect();
    return response;
  };
}
