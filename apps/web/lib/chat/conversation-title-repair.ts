import { sanitizeConversationTitle } from './title';
import { conversationTitleSource } from './title-source';

export interface ConversationTitleRepairRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly creatorProfileId: string | null;
  readonly title: string | null;
  readonly firstUserMessage: string | null;
}

export interface ConversationTitleRepair {
  readonly conversationId: string;
  readonly userId: string;
  readonly creatorProfileId: string;
  readonly oldTitle: string;
  readonly newTitle: string;
}

/** Only exact legacy auto-title receipts for an explicitly selected owner qualify. */
export function planConversationTitleRepairs(
  records: readonly ConversationTitleRepairRecord[],
  scope: { readonly userId: string; readonly creatorProfileId: string }
): ConversationTitleRepair[] {
  return records.flatMap(record => {
    if (
      record.userId !== scope.userId ||
      record.creatorProfileId !== scope.creatorProfileId ||
      !record.title ||
      !record.firstUserMessage
    )
      return [];
    const source = conversationTitleSource(record.firstUserMessage);
    // Historical fallback used UTF-16 slicing; preserve that exact receipt.
    const legacySource =
      sanitizeConversationTitle(
        record.firstUserMessage,
        Math.max(record.firstUserMessage.length, 50)
      )?.replaceAll(/(?:^["'])|(?:["']$)/g, '') ?? null;
    const legacyTitle =
      legacySource && legacySource.length > 50
        ? `${legacySource.slice(0, 47).trimEnd()}...`
        : legacySource;
    const newTitle = sanitizeConversationTitle(source.text, 50);
    if (
      !source.deterministic ||
      !newTitle ||
      record.title !== legacyTitle ||
      record.title === newTitle
    )
      return [];
    return [
      { conversationId: record.id, ...scope, oldTitle: record.title, newTitle },
    ];
  });
}
