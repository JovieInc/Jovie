const NEW_CHAT_DRAFT_KEY = '__new__';
const DRAFT_CACHE_LIMIT = 50;

const draftByConversationId = new Map<string, string>();

function draftKey(conversationId: string | null | undefined): string {
  return conversationId ?? NEW_CHAT_DRAFT_KEY;
}

function trimDraft(value: string): string {
  return value;
}

function pruneDraftCache(): void {
  while (draftByConversationId.size > DRAFT_CACHE_LIMIT) {
    const oldestKey = draftByConversationId.keys().next().value;
    if (!oldestKey) break;
    draftByConversationId.delete(oldestKey);
  }
}

/** Persist the in-progress composer text for a conversation thread. */
export function saveComposerDraft(
  conversationId: string | null | undefined,
  value: string
): void {
  const key = draftKey(conversationId);
  const nextValue = trimDraft(value);
  if (nextValue.length === 0) {
    draftByConversationId.delete(key);
    return;
  }
  draftByConversationId.set(key, nextValue);
  pruneDraftCache();
}

/** Read the saved composer draft for a conversation thread. */
export function readComposerDraft(
  conversationId: string | null | undefined
): string {
  return draftByConversationId.get(draftKey(conversationId)) ?? '';
}

/** Remove a saved composer draft after a successful send or command commit. */
export function clearComposerDraft(
  conversationId: string | null | undefined
): void {
  draftByConversationId.delete(draftKey(conversationId));
}

/** Test helper — reset module state between unit tests. */
export function resetComposerDraftStoreForTests(): void {
  draftByConversationId.clear();
}
