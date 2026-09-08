/**
 * Minimal Telegram bot client for Hermes-Air outbound notifications.
 * Inbound message handling lives inside the Hermes daemon's built-in gateway.
 */

import { existsSync, readFileSync } from 'node:fs';

import { HERMES_PATHS } from './hermes-paths';
import { withRetry } from './retry';

const TELEGRAM_API = 'https://api.telegram.org';

function getChatId(): string | null {
  const fromEnv = process.env.HERMES_TELEGRAM_CHAT_ID;
  if (fromEnv) return fromEnv;
  if (!existsSync(HERMES_PATHS.telegramChatId)) return null;
  try {
    return readFileSync(HERMES_PATHS.telegramChatId, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Send a plain-text Telegram message. We intentionally do NOT use
 * parse_mode='Markdown' because hermes-air messages can contain user voice
 * memo content, error strings with backticks, and JSON snippets — any of
 * which can trip Telegram's parser and silently drop the message. Plain
 * text is robust; we don't need formatting for ops notifications.
 */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.HERMES_TELEGRAM_BOT_TOKEN;
  const chatId = getChatId();
  if (!token || !chatId) return false;
  try {
    await withRetry(
      async () => {
        const response = await fetch(
          `${TELEGRAM_API}/bot${token}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: text.slice(0, 4000), // Telegram cap is 4096; leave headroom
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Telegram ${response.status}`);
        }
        if (!response.ok) {
          const err = new Error(`Telegram ${response.status}`);
          (err as Error & { permanent?: boolean }).permanent = true;
          throw err;
        }
      },
      { caller: 'telegram.send', attempts: 3, baseMs: 300 }
    );
    return true;
  } catch {
    return false;
  }
}
