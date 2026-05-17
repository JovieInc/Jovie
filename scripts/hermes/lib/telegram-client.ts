/**
 * Minimal Telegram bot client for Hermes-Air outbound notifications.
 * Inbound message handling lives inside the Hermes daemon's built-in gateway.
 */

import { existsSync, readFileSync } from 'node:fs';

import { HERMES_PATHS } from './hermes-paths';

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

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.HERMES_TELEGRAM_BOT_TOKEN;
  const chatId = getChatId();
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
