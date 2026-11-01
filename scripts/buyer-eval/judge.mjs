// Strong tier: independent samples from a vision model on the sanctioned
// Workers AI route (JOV-10091). The route and model come from
// apps/web/lib/ai/routing.json caller `dev.buyer-eval`; calls go through
// Jovie's Workers AI relay with the shared API client (budget, breaker,
// retries). Frames are sent inline as base64 images, so the model sees the
// prompt and the frames and nothing else: no tools, no files, no memory.
// It replaced `claude -p` on a consumer subscription, which is forbidden for
// automation (ops/registry/fleet.json lane-claude; scripts/subscription-cli-guard.mjs).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { createApiClient } from '../../packages/api-client/client.ts';
import { hashCredential } from '../../packages/api-client/store.ts';
import {
  buildBuyerPrompt,
  buildBuyerSchema,
  parseBuyerSample,
} from './rubric.mjs';

export const ROUTE_ID = 'dev.buyer-eval';
export const DEFAULT_SAMPLES = 3;
/** Workers AI bills neurons: $0.011 per 1,000 (ops/registry/capacity.json, cloudflare). */
export const USD_PER_K_NEURONS = 0.011;
/** Relay body cap is 8 MiB; stay under it with room for the prompt. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Reasoning plus the JSON answer; the relay caps output at 16,384. */
const MAX_OUTPUT_TOKENS = 12_000;

const ROUTING = JSON.parse(
  readFileSync(
    new URL('../../apps/web/lib/ai/routing.json', import.meta.url),
    'utf8'
  )
);

/** The strong tier's route from routing.json; fail closed when it is not Workers AI. */
export function strongRoute(routing = ROUTING) {
  const caller = routing.callers.find(row => row.id === ROUTE_ID);
  if (!caller?.models?.[0])
    throw new Error(`routing.json has no ${ROUTE_ID} caller`);
  if (caller.route !== 'workers-ai-only')
    throw new Error(`${ROUTE_ID} must be workers-ai-only, got ${caller.route}`);
  return {
    model: caller.models[0],
    baseUrl: routing.providers['workers-ai'].relayBaseUrl,
  };
}

export const STRONG_MODEL = strongRoute().model;

/**
 * Words that exist only in company memory/docs, never in a walk or prompt.
 * Seeing one in a judge's output means context leaked in (review #7).
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

export function contaminated(raw, prompt) {
  const out = JSON.stringify(raw ?? '').toLowerCase();
  const inPrompt = prompt.toLowerCase();
  const has = (text, word) =>
    new RegExp(
      `(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^a-z0-9])`,
      'u'
    ).test(text);
  return CONTAMINATION_MARKERS.filter(
    word => has(out, word) && !has(inPrompt, word)
  );
}

/**
 * Workers AI accepts at most 8 images per request (measured 2026-10-31:
 * error 8007 "Image count 14 exceeds limit 8 per request").
 */
export const MAX_IMAGES_PER_REQUEST = 8;
const FRAME_WIDTH = 1280;
const SHEET_WIDTH = 1024;

/**
 * Encode one attached image as JPEG with ffmpeg (already an ingest
 * dependency): a single frame at most 1280 wide, or a sheet of several frames
 * stacked top to bottom at 1024 wide. Written next to the frames, which run.mjs
 * deletes after the run.
 */
export function encodeFrames(paths) {
  const out = join(
    dirname(paths[0]),
    `${basename(paths[0], extname(paths[0]))}-x${paths.length}.judge.jpg`
  );
  const filter =
    paths.length === 1
      ? `scale='min(${FRAME_WIDTH},iw)':-2`
      : `${paths.map((_, i) => `[${i}:v]scale=${SHEET_WIDTH}:-2[f${i}]`).join(';')};${paths.map((_, i) => `[f${i}]`).join('')}vstack=inputs=${paths.length}`;
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
    throw new Error(`could not encode frames: ${run.stderr?.slice(0, 160)}`);
  return { mime: 'image/jpeg', bytes: readFileSync(out) };
}

/**
 * Pick what to attach within the per-request image cap: every frame when
 * they fit; else each step's first frame (the step screenshot); else
 * consecutive steps stacked into at most MAX_IMAGES_PER_REQUEST sheets.
 */
export function planImages(steps, max = MAX_IMAGES_PER_REQUEST) {
  const all = steps.flatMap(step =>
    step.images.map((path, index) => ({
      label: `STEP ${step.stepId}${step.images.length > 1 ? ` (frame ${index + 1} of ${step.images.length})` : ''}`,
      paths: [path],
    }))
  );
  if (all.length <= max) return all;
  const firsts = steps
    .filter(step => step.images.length)
    .map(step => ({ stepId: step.stepId, path: step.images[0] }));
  if (firsts.length <= max)
    return firsts.map(row => ({
      label: `STEP ${row.stepId}`,
      paths: [row.path],
    }));
  const per = Math.ceil(firsts.length / max);
  const sheets = [];
  for (let i = 0; i < firsts.length; i += per) {
    const group = firsts.slice(i, i + per);
    sheets.push({
      label: `STEPS ${group.map(row => row.stepId).join(', ')} (stacked top to bottom)`,
      paths: group.map(row => row.path),
    });
  }
  return sheets;
}

/**
 * OpenAI-style content: the prompt, then each attached image after its label.
 * Over the relay body budget, throw (an unjudged walk is an abstain, never a pass).
 */
export function buildContent(prompt, steps, encode = encodeFrames) {
  const plan = planImages(steps);
  const encoded = plan.map(unit => ({ ...unit, ...encode(unit.paths) }));
  const bytes = encoded.reduce((sum, unit) => sum + unit.bytes.length, 0);
  if (bytes * 1.34 > MAX_IMAGE_BYTES)
    throw new Error('walk frames exceed the relay body budget');
  /** @type {Array<{ type: string, text?: string, image_url?: { url: string } }>} */
  const content = [{ type: 'text', text: prompt }];
  for (const unit of encoded) {
    content.push({ type: 'text', text: `Image: ${unit.label}` });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${unit.mime};base64,${unit.bytes.toString('base64')}`,
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
  timeoutMs,
  env = process.env,
  baseUrl = strongRoute().baseUrl,
  createClient = createApiClient,
}) {
  const token = env.WORKERS_AI_TOKEN?.trim();
  if (!token) throw new Error('WORKERS_AI_TOKEN not set (doppler jovie-web)');
  const base = (env.WORKERS_AI_BASE_URL?.trim() || baseUrl).replace(
    /\/+$/u,
    ''
  );
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
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'buyer_forecast', strict: true, schema },
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
 * Run N independent samples. A failed or contaminated sample is recorded and
 * excluded; aggregateSamples abstains when too few coherent samples remain.
 */
export async function judgeBuyer({
  persona,
  outcome,
  walk,
  samples = DEFAULT_SAMPLES,
  model = STRONG_MODEL,
  timeoutMs = 600_000,
  call = callRelay,
  encode = encodeFrames,
}) {
  // Tier A archetypes (and Tier B on a walk that is not their own) watch a
  // stand-in account; v1 counted the stand-in's small numbers as an objection.
  const prompt = buildBuyerPrompt({
    persona,
    outcome,
    steps: walk.steps,
    standIn: walk.subjectId !== persona.id,
  });
  const schema = buildBuyerSchema(walk.steps.map(step => step.stepId));
  const content = buildContent(prompt, walk.steps, encode);
  const settled = await Promise.allSettled(
    Array.from({ length: samples }, () =>
      call({ model, content, schema, timeoutMs })
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
      parsed.push(parseBuyerSample(answer, walk.steps));
    } catch (error) {
      failures.push(String(error?.message ?? error).slice(0, 200));
    }
  }
  return {
    model,
    route: ROUTE_ID,
    samples: parsed,
    failures,
    costUsd,
    inputTokens,
    outputTokens,
  };
}
