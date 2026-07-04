/**
 * Best-effort ops alerts for Hermes shipping jobs (Telegram + optional Slack).
 */

import { sendTelegram } from './telegram-client';

export async function sendOpsAlert(text: string): Promise<{
  readonly telegram: boolean;
  readonly slack: boolean;
}> {
  const telegram = await sendTelegram(text);
  const slack = await sendSlackWebhook(text);
  return { telegram, slack };
}

async function sendSlackWebhook(text: string): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhook) return false;
  try {
    const response = await fetch(webhook, {
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
