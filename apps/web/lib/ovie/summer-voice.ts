import 'server-only';
import { env } from '@/lib/env-server';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { parseSseFrames } from '@/lib/ovie/summer-fast-speaker';
import { fetchSummerShadow } from '@/lib/ovie/summer-shadow-client';

/**
 * Summer voice (Tim, 2026-10-25): full-duplex voice for the Ovie composer.
 *
 * Provider: ElevenLabs Agents (ELEVENLABS_API_KEY already in jovie-web prd).
 * OpenAI Realtime is excluded by the JOV-7119 per-token API ban; xAI voice is
 * a beta alternative behind the provider-neutral gateway (lib/voice-gateway).
 *
 * The voice model only transcribes and speaks. Every fact comes from the
 * `ask_summer` CLIENT tool, which the browser runs against
 * `/api/ovie/summer-voice/ask` with the founder's session, so reasoning,
 * grounding and the Kimi K3.1 Pro planner handoff stay server-side in Summer.
 */

export const SUMMER_VOICE_ASK_TOOL = 'ask_summer';
export const SUMMER_VOICE_FIRST_MESSAGE = 'Summer here. What do you need?';
export const SUMMER_VOICE_PROMPT = [
  'You are the voice of Summer, the private company operator for Jovie and its founder Tim.',
  "You do not know any company facts. For every question about shipping, revenue, spend, issues, errors, priorities or plans, call ask_summer with the question in Tim's words, then say the answer in one to three short spoken sentences.",
  'Never invent numbers or status. If ask_summer fails, say so briefly and stop.',
  'No lists, no markdown, no ids or URLs out loud. Be quick; Tim may interrupt at any time.',
].join('\n');

/** Client tool definition to configure on the ElevenLabs agent (docs/SUMMER_VOICE.md). */
export const SUMMER_VOICE_AGENT_TOOL = {
  type: 'client',
  name: SUMMER_VOICE_ASK_TOOL,
  description:
    'Ask Summer, the company operator, anything about the company. Returns a short spoken-ready answer.',
  expects_response: true,
  response_timeout_secs: 60,
  parameters: {
    type: 'object',
    required: ['question'],
    properties: {
      question: { type: 'string', description: "Tim's question in his words." },
    },
  },
} as const;

export type SummerVoiceSession =
  | {
      readonly ok: true;
      readonly provider: 'elevenlabs';
      readonly signedUrl: string;
      readonly firstMessage: string;
    }
  | {
      readonly ok: false;
      readonly code: 'voice_not_configured' | 'voice_provider_unavailable';
    };

export async function createSummerVoiceSession(): Promise<SummerVoiceSession> {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();
  const agentId = env.ELEVENLABS_SUMMER_AGENT_ID?.trim();
  if (!apiKey || !agentId) return { ok: false, code: 'voice_not_configured' };
  try {
    const response = await boundedFetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers: { 'xi-api-key': apiKey },
        timeoutMs: 8_000,
        retry: { maxRetries: 0, baseDelayMs: 0 },
        context: 'ElevenLabs signed URL',
      }
    );
    if (!response.ok) return { ok: false, code: 'voice_provider_unavailable' };
    const data = (await response.json()) as { signed_url?: unknown };
    return typeof data.signed_url === 'string' &&
      data.signed_url.startsWith('wss://')
      ? {
          ok: true,
          provider: 'elevenlabs',
          signedUrl: data.signed_url,
          firstMessage: SUMMER_VOICE_FIRST_MESSAGE,
        }
      : { ok: false, code: 'voice_provider_unavailable' };
  } catch {
    return { ok: false, code: 'voice_provider_unavailable' };
  }
}

export type SummerVoiceAnswer =
  | {
      readonly ok: true;
      readonly text: string;
      readonly ttftMs: number;
      readonly totalMs: number;
    }
  | { readonly ok: false; readonly code: 'summer_unavailable' };

const ASK_DEADLINE_MS = 55_000;

/** Runs one voice-mode turn against Summer's fast chat and returns the full text. */
export async function askSummerForVoice(input: {
  readonly question: string;
  readonly principalHash: string;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}): Promise<SummerVoiceAnswer> {
  const now = input.now ?? Date.now;
  const startedAt = now();
  const signal = AbortSignal.any([
    ...(input.signal ? [input.signal] : []),
    AbortSignal.timeout(ASK_DEADLINE_MS),
  ]);
  try {
    const response = await fetchSummerShadow('/ovie/v1/summer-chat/stream', {
      method: 'POST',
      body: JSON.stringify({
        message: input.question.slice(0, 4000),
        mode: 'voice',
        history: [],
      }),
      signal,
      headers: { 'x-jovie-summer-principal-hash': input.principalHash },
    });
    if (!response.ok || !response.body) {
      return { ok: false, code: 'summer_unavailable' };
    }
    let text = '';
    let firstAt: number | null = null;
    for await (const frame of parseSseFrames(response.body)) {
      if (frame.event === 'delta' && typeof frame.data.text === 'string') {
        firstAt ??= now();
        text += frame.data.text;
      } else if (frame.event === 'error') {
        return { ok: false, code: 'summer_unavailable' };
      }
    }
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, code: 'summer_unavailable' };
    return {
      ok: true,
      text: trimmed,
      ttftMs: (firstAt ?? now()) - startedAt,
      totalMs: now() - startedAt,
    };
  } catch {
    return { ok: false, code: 'summer_unavailable' };
  }
}
