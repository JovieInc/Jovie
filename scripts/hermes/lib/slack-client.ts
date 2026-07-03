/**
 * Minimal Slack incoming-webhook client for Hermes outbound notifications.
 */

import { withRetry } from './retry';

function getWebhookUrl(): string | null {
  return (
    process.env.HERMES_SLACK_WEBHOOK_URL ??
    process.env.SLACK_WEBHOOK_URL ??
    null
  );
}

export async function sendSlack(text: string): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return false;
  try {
    await withRetry(
      async () => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 3000) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Slack ${response.status}`);
        }
        if (!response.ok) {
          const err = new Error(`Slack ${response.status}`);
          (err as Error & { permanent?: boolean }).permanent = true;
          throw err;
        }
      },
      { caller: 'slack.send', attempts: 3, baseMs: 300 }
    );
    return true;
  } catch {
    return false;
  }
}