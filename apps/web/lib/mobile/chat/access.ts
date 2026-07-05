import 'server-only';

/**
 * Native iOS is internal-only for v1, so chat is no longer hidden behind
 * rollout flags or environment switches.
 */
export function isMobileChatRuntimeEnabled(): boolean {
  return true;
}

/**
 * Auth remains the gate. Callers should pass the mobile-session user id after
 * session validation; null stays disabled so this helper cannot become an auth
 * bypass if reused incorrectly.
 */
export async function isMobileChatEnabled(
  userId: string | null
): Promise<boolean> {
  return userId !== null;
}
