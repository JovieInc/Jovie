/**
 * Release-gate synthetic chats (the prod smoke's "prodcert synthetic check"
 * probe) must not stay in the certified account's visible chat history.
 * Teardown sweeps by title through the product API instead of trusting the
 * browser URL at one instant, which was null when the router had not yet
 * swapped /app/chat for /app/chat/<id>.
 */
export const SYNTHETIC_CHAT_TITLE_PREFIX = 'prodcert synthetic check';

interface ApiResponseLike {
  ok(): boolean;
  json(): Promise<unknown>;
}

export interface SyntheticChatRequestLike {
  get(url: string): Promise<ApiResponseLike>;
  delete(url: string): Promise<ApiResponseLike>;
}

export async function deleteSyntheticChats(
  request: SyntheticChatRequestLike,
  origin: string
): Promise<number> {
  const list = await request.get(`${origin}/api/chat/conversations?limit=50`);
  if (!list.ok()) return 0;
  const body = (await list.json()) as {
    conversations?: ReadonlyArray<{ id: string; title: string | null }>;
  };
  const stale = (body.conversations ?? []).filter(c =>
    (c.title ?? '').toLowerCase().startsWith(SYNTHETIC_CHAT_TITLE_PREFIX)
  );
  let deleted = 0;
  for (const conversation of stale) {
    const res = await request.delete(
      `${origin}/api/chat/conversations/${conversation.id}`
    );
    if (res.ok()) deleted += 1;
  }
  return deleted;
}
