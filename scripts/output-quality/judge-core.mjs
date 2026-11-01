// Shared audience-judge transport (canon: JovieInc/ci canon/OUTPUT-QUALITY-LOOP.md).
//
// One place for the sanctioned model route, image encoding, the Workers AI
// relay call, N independent samples, cost accounting and the contamination
// canary. intent-eval.mjs and buyer-eval (scripts/buyer-eval/judge.mjs) are
// both thin layers over this file; a new audience eval (would-you-invest,
// would-Tim-read-this) adds a rubric, never a transport.
//
// Routes come from apps/web/lib/ai/routing.json and must be workers-ai-only
// (Cloudflare credits, no new spend). Calls go through the shared api-client
// (budget, breaker, retries). Frames are sent inline, so the judge sees the
// prompt and the artifact and nothing else: no tools, files or memory.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiClient } from '../../packages/api-client/client.ts';
import { hashCredential } from '../../packages/api-client/store.ts';

/** Workers AI bills neurons: $0.011 per 1,000 (ops/registry/capacity.json, cloudflare). */
export const USD_PER_K_NEURONS = 0.011;
/** Relay body cap is 8 MiB; stay under it with room for the prompt. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Workers AI accepts at most 8 images per request (measured 2026-10-31, error 8007). */
export const MAX_IMAGES_PER_REQUEST = 8;
/** Reasoning plus the JSON answer; the relay caps output at 16,384. */
const MAX_OUTPUT_TOKENS = 12_000;

export const ROUTING = JSON.parse(
  readFileSync(
    new URL('../../apps/web/lib/ai/routing.json', import.meta.url),
    'utf8'
  )
);

/** A caller's route from routing.json; fail closed unless it is Workers AI only. */
export function routeFor(id, routing = ROUTING) {
  const caller = routing.callers.find(row => row.id === id);
  if (!caller?.models?.[0]) throw new Error(`routing.json has no ${id} caller`);
  if (caller.route !== 'workers-ai-only')
    throw new Error(`${id} must be workers-ai-only, got ${caller.route}`);
  return {
    id,
    model: caller.models[0],
    models: caller.models,
    baseUrl: routing.providers['workers-ai'].relayBaseUrl,
  };
}

/**
 * Words that exist only in company memory/docs. Seeing one in a judge's
 * output that the prompt did not contain means context leaked in.
 */
export const CONTAMINATION_MARKERS = Object.freeze([
  '$300',
  '300/mo',
  'ovie',
  'summer',
  'gbrain',
  'premium pricing',
  'icp',
]);

export function contaminated(raw, prompt, markers = CONTAMINATION_MARKERS) {
  const out = JSON.stringify(raw ?? '').toLowerCase();
  const inPrompt = prompt.toLowerCase();
  const has = (text, word) =>
    new RegExp(
      `(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^a-z0-9])`,
      'u'
    ).test(text);
  return markers.filter(word => has(out, word) && !has(inPrompt, word));
}

/**
 * Encode images as one JPEG with ffmpeg: a single image at most `width`
 * wide, or several stacked top to bottom. Written to a temp dir that is
 * removed before returning.
 */
export function encodeImages(paths, { width = 1280, sheetWidth = 1024 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'judge-frames-'));
  const out = join(dir, `x${paths.length}.jpg`);
  try {
    const filter =
      paths.length === 1
        ? `scale='min(${width},iw)':-2`
        : `${paths.map((_, i) => `[${i}:v]scale=${sheetWidth}:-2[f${i}]`).join(';')};${paths.map((_, i) => `[f${i}]`).join('')}vstack=inputs=${paths.length}`;
    const run = spawnSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        ...paths.flatMap(path => ['-i', path]),
        ...(paths.length === 1 ? ['-vf', filter] : ['-filter_complex', filter]),
        '-frames:v',
        '1',
        '-q:v',
        '4',
        out,
      ],
      { encoding: 'utf8' }
    );
    if (run.status !== 0 || !existsSync(out))
      throw new Error(`could not encode images: ${run.stderr?.slice(0, 160)}`);
    return { mime: 'image/jpeg', bytes: readFileSync(out) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * OpenAI-style content: the prompt, then each labeled image. Over the relay
 * body budget, throw (an unjudged artifact is an abstain, never a pass).
 * @param {string} prompt
 * @param {Array<{ label: string, mime: string, bytes: Buffer }>} images
 */
export function contentFor(prompt, images = []) {
  if (images.length > MAX_IMAGES_PER_REQUEST)
    throw new Error(`at most ${MAX_IMAGES_PER_REQUEST} images per request`);
  const bytes = images.reduce((sum, image) => sum + image.bytes.length, 0);
  if (bytes * 1.34 > MAX_IMAGE_BYTES)
    throw new Error('images exceed the relay body budget');
  /** @type {Array<{ type: string, text?: string, image_url?: { url: string } }>} */
  const content = [{ type: 'text', text: prompt }];
  for (const image of images) {
    content.push({ type: 'text', text: `Image: ${image.label}` });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${image.mime};base64,${image.bytes.toString('base64')}`,
      },
    });
  }
  return content;
}

/** Parse the model's JSON answer; tolerate a fenced block, nothing looser. */
export function parseAnswer(text) {
  const raw = String(text ?? '').trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(raw);
  return JSON.parse(fenced ? fenced[1] : raw);
}

export function usdFor(usage) {
  const neurons = Number(usage?.neurons);
  return Number.isFinite(neurons) ? (neurons / 1000) * USD_PER_K_NEURONS : 0;
}

/**
 * One chat completion through the Workers AI relay. Returns the answer text
 * and usage; throws on any non-2xx, truncation or empty answer.
 */
export async function callRelay({
  model,
  content,
  schema,
  schemaName = 'audience_judgement',
  timeoutMs = 300_000,
  maxTokens = MAX_OUTPUT_TOKENS,
  baseUrl,
  env = process.env,
  createClient = createApiClient,
}) {
  const token = env.WORKERS_AI_TOKEN?.trim();
  if (!token) throw new Error('WORKERS_AI_TOKEN not set (doppler jovie-web)');
  const base = (
    env.WORKERS_AI_BASE_URL?.trim() ||
    baseUrl ||
    ROUTING.providers['workers-ai'].relayBaseUrl
  ).replace(/\/+$/u, '');
  const client = createClient({
    provider: 'cloudflare',
    credential: hashCredential('cloudflare', token),
    authorize: headers => {
      headers.set('Authorization', `Bearer ${token}`);
    },
  });
  const res = await client.request({
    url: `${base}/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model,
      max_tokens: maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
      messages: [{ role: 'user', content }],
    },
    priority: 'default',
    write: false,
    idempotent: true,
    maxAttempts: 2,
    maxWaitMs: timeoutMs,
    timeoutMs,
  });
  if (res.status < 200 || res.status >= 300)
    throw new Error(
      `workers-ai relay ${res.status}: ${res.text.slice(0, 200)}`
    );
  /** @type {any} */
  const body = res.json();
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === 'length')
    throw new Error('judge answer truncated (finish_reason length)');
  const text = choice?.message?.content;
  if (!text) throw new Error('judge returned no answer');
  return { text, usage: body.usage ?? {} };
}

/**
 * Run N independent samples of one prompt. A failed, unparseable or
 * contaminated sample is recorded in `failures` and excluded; callers
 * abstain when too few coherent samples remain.
 * @param {{ model: string, prompt: string, content: any[], schema: object, samples?: number,
 *   parse?: (answer: any) => any, call?: typeof callRelay, timeoutMs?: number, schemaName?: string }} options
 */
export async function sampleJudge({
  model,
  prompt,
  content,
  schema,
  samples = 1,
  parse = answer => answer,
  call = callRelay,
  timeoutMs,
  schemaName,
  maxTokens,
}) {
  const settled = await Promise.allSettled(
    Array.from({ length: samples }, () =>
      call({ model, content, schema, timeoutMs, schemaName, maxTokens })
    )
  );
  const parsed = [];
  const failures = [];
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failures.push(
        String(result.reason?.message ?? result.reason).slice(0, 200)
      );
      continue;
    }
    const { text, usage } = result.value;
    costUsd += usdFor(usage);
    inputTokens += Number(usage?.prompt_tokens) || 0;
    outputTokens += Number(usage?.completion_tokens) || 0;
    try {
      const answer = parseAnswer(text);
      const leaks = contaminated(answer, prompt);
      if (leaks.length) throw new Error(`contaminated: ${leaks.join(',')}`);
      parsed.push(parse(answer));
    } catch (error) {
      failures.push(String(error?.message ?? error).slice(0, 200));
    }
  }
  return {
    model,
    samples: parsed,
    failures,
    costUsd,
    inputTokens,
    outputTokens,
  };
}
