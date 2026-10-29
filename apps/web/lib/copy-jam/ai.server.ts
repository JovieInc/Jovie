import 'server-only';
import { env } from '@/lib/env-server';
import type { JamLeftover } from './parse-jam';
import type { CopyVerdict } from './verdicts';

/**
 * Client for the Copy Jam Workers AI relay (`workers/copy-jam-ai`): Whisper
 * for the memo, a small model for spoken segments the parser could not settle.
 * Workers AI only. Without the relay configured, voice is unavailable and the
 * caller says so; nothing falls back to another provider.
 */

export class CopyJamAiUnavailableError extends Error {
  constructor(message = 'Copy Jam AI relay is not configured') {
    super(message);
    this.name = 'CopyJamAiUnavailableError';
  }
}

function relay(): { url: string; secret: string } {
  const url = env.COPY_JAM_AI_URL;
  const secret = env.COPY_JAM_AI_SECRET;
  if (!url || !secret) throw new CopyJamAiUnavailableError();
  return { url: url.replace(/\/$/, ''), secret };
}

async function post(path: string, init: RequestInit): Promise<unknown> {
  const { url, secret } = relay();
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    ...init,
    headers: { authorization: `Bearer ${secret}`, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`copy-jam-ai ${path} ${res.status}`);
  return res.json();
}

export async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  const body = (await post('/transcribe', {
    body: audio,
    headers: { 'content-type': 'application/octet-stream' },
  })) as { text?: string };
  return (body.text ?? '').trim();
}

export interface ClassifiedLeftover {
  readonly copyIds: readonly string[];
  readonly verdict: CopyVerdict;
  readonly note: string;
}

export async function classifyLeftovers(
  leftovers: readonly JamLeftover[]
): Promise<readonly ClassifiedLeftover[]> {
  const settle = leftovers.filter(l => l.reason === 'no-verdict').slice(0, 20);
  if (settle.length === 0) return [];
  const body = (await post('/classify', {
    body: JSON.stringify({
      segments: settle.map(l => ({ segment: l.segment, copyIds: l.copyIds })),
    }),
    headers: { 'content-type': 'application/json' },
  })) as { results?: Array<{ n?: number; verdict?: string; note?: string }> };
  const out: ClassifiedLeftover[] = [];
  for (const r of body.results ?? []) {
    const leftover = typeof r.n === 'number' ? settle[r.n - 1] : undefined;
    if (!leftover) continue;
    if (r.verdict !== 'sucks' && r.verdict !== 'meh' && r.verdict !== 'great') {
      continue; // "unclear": stays unmatched, Tim sees it in the result
    }
    out.push({
      copyIds: leftover.copyIds,
      verdict: r.verdict,
      note: (r.note ?? '').slice(0, 300),
    });
  }
  return out;
}
