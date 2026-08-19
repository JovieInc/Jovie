/**
 * Tim-only Telegram admission for the Ovie Eve fallback.
 *
 * An empty allowlist fails closed. This is not the Hermes/Summer bot door.
 */

const ALLOWLIST_ENV = 'OVIE_TELEGRAM_ALLOWED_USER_IDS';

export function parseOvieTelegramAllowedUserIds(
  raw = process.env[ALLOWLIST_ENV]
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(/[\s,]+/)
      .map(id => id.trim())
      .filter(Boolean)
  );
}

export type TelegramAdmissionMessage = {
  readonly chat: { readonly type: string };
  readonly from?: { readonly id: string; readonly isBot: boolean };
};

/**
 * Admit only a private chat from an allowlisted human. Groups, channels,
 * bots, and an unset allowlist are dropped.
 */
export function admitOvieTelegramMessage(
  message: TelegramAdmissionMessage,
  allowedUserIds = parseOvieTelegramAllowedUserIds()
): boolean {
  if (allowedUserIds.size === 0) return false;
  if (message.chat.type !== 'private') return false;
  if (!message.from || message.from.isBot) return false;
  return allowedUserIds.has(message.from.id);
}
