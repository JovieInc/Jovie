/**
 * Canonical Jovie core-chat shadow POST body.
 *
 * Mirrors `EveAgentAdapter.invokeEve` in apps/web: latest user text plus
 * read-only routing metadata. Never includes user id, system prompt, or
 * provider credentials — those leaks are the promotion-gate contract.
 */
export const CORE_CHAT_PROTOCOL_VERSION = 1;
export const MAX_USER_MESSAGE_CHARS = 4_000;

export function coreChatSessionBody(message: string, requestId: string) {
  const text =
    message.trim() ||
    'Register this Jovie core chat turn as a shadow observation.';

  return {
    message: text.slice(0, MAX_USER_MESSAGE_CHARS),
    clientContext: {
      source: 'jovie-core-chat',
      protocolVersion: CORE_CHAT_PROTOCOL_VERSION,
      requestId,
      mode: 'shadow',
      selectedModel: 'fixture',
      toolNames: ['jovie_capability_manifest'],
      readOnly: true,
    },
  };
}

export function sessionBodyHasForbiddenKeys(
  body: ReturnType<typeof coreChatSessionBody>
): string[] {
  const root = body as Record<string, unknown>;
  const context = body.clientContext as Record<string, unknown>;
  const forbidden = [
    'userId',
    'user_id',
    'systemPrompt',
    'system_prompt',
    'apiKey',
    'api_key',
    'authorization',
    'credentials',
  ];
  return forbidden.filter(key => key in root || key in context);
}
