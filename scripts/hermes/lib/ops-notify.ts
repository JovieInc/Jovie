/**
 * Outbound ops notifications for Hermes cron jobs (Telegram + optional Slack).
 */

import { sendTelegram } from './telegram-client';

async function sendSlackWebhook(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Best-effort fan-out for operator-visible shipper/control-plane alerts. */
export async function notifyOps(text: string): Promise<void> {
  await Promise.all([sendTelegram(text), sendSlackWebhook(text)]);
}
