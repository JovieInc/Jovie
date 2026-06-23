import { boundedFetch } from '../bounded-fetch';
import { TASTE_SLACK_REACTIONS } from './constants';

const SLACK_API_BASE = 'https://slack.com/api';

export interface TasteSlackPostResult {
  readonly ok: boolean;
  readonly channel?: string;
  readonly messageTs?: string;
  readonly error?: string;
}

function getSlackBotToken(): string | undefined {
  return process.env.SLACK_BOT_TOKEN?.trim() || undefined;
}

export function getTasteSlackChannelId(): string | undefined {
  return process.env.TASTE_SLACK_CHANNEL_ID?.trim() || undefined;
}

export function isTasteSlackConfigured(): boolean {
  return Boolean(getSlackBotToken() && getTasteSlackChannelId());
}

async function slackApi<T extends Record<string, unknown>>(
  method: string,
  body: Record<string, string>
): Promise<T & { ok: boolean; error?: string }> {
  const token = getSlackBotToken();
  if (!token) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' } as T & {
      ok: boolean;
      error?: string;
    };
  }

  const response = await boundedFetch(`${SLACK_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    timeoutMs: 10_000,
    context: `slack.${method}`,
  });

  return (await response.json()) as T & { ok: boolean; error?: string };
}

export async function postTasteSlackMessage(params: {
  readonly channel: string;
  readonly text: string;
  readonly blocks: string;
}): Promise<TasteSlackPostResult> {
  const payload = await slackApi<{ channel?: string; ts?: string }>(
    'chat.postMessage',
    {
      channel: params.channel,
      text: params.text,
      blocks: params.blocks,
      unfurl_links: 'false',
      unfurl_media: 'false',
    }
  );

  if (!payload.ok || !payload.ts) {
    return {
      ok: false,
      error: payload.error ?? 'chat.postMessage failed',
    };
  }

  return {
    ok: true,
    channel: payload.channel ?? params.channel,
    messageTs: payload.ts,
  };
}

export async function addTasteSlackReactions(params: {
  readonly channel: string;
  readonly messageTs: string;
}): Promise<void> {
  for (const name of TASTE_SLACK_REACTIONS) {
    const payload = await slackApi<Record<string, never>>('reactions.add', {
      channel: params.channel,
      timestamp: params.messageTs,
      name,
    });
    if (!payload.ok && payload.error !== 'already_reacted') {
      throw new Error(`reactions.add(${name}) failed: ${payload.error}`);
    }
  }
}
