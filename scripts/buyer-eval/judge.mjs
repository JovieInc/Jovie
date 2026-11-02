// Strong tier: independent samples from a vision model on the sanctioned
// Workers AI route (JOV-10091). The route and model come from
// apps/web/lib/ai/routing.json caller `dev.buyer-eval`; calls go through
// Jovie's Workers AI relay with the shared API client (budget, breaker,
// retries). Frames are sent inline as base64 images, so the model sees the
// prompt and the frames and nothing else: no tools, no files, no memory.
// It replaced `claude -p` on a consumer subscription, which is forbidden for
// automation (ops/registry/fleet.json lane-claude; scripts/subscription-cli-guard.mjs).

import {
  CONTAMINATION_MARKERS,
  callRelay,
  contaminated,
  contentFor,
  encodeImages,
  MAX_IMAGES_PER_REQUEST,
  parseAnswer,
  routeFor,
  sampleJudge,
  USD_PER_K_NEURONS,
  usdFor,
} from '../output-quality/judge-core.mjs';
import {
  buildBuyerPrompt,
  buildBuyerSchema,
  parseBuyerSample,
} from './rubric.mjs';

// Transport, encoding, contamination and cost live in the shared audience
// judge (scripts/output-quality/judge-core.mjs); buyer-eval owns only the walk
// image plan and the pay-forecast rubric.
export {
  CONTAMINATION_MARKERS,
  callRelay,
  contaminated,
  MAX_IMAGES_PER_REQUEST,
  parseAnswer,
  USD_PER_K_NEURONS,
  usdFor,
};

export const ROUTE_ID = 'dev.buyer-eval';
export const DEFAULT_SAMPLES = 3;

/** The strong tier's route from routing.json; fail closed when it is not Workers AI. */
export function strongRoute(routing) {
  const { model, baseUrl } = routeFor(ROUTE_ID, routing);
  return { model, baseUrl };
}

export const STRONG_MODEL = strongRoute().model;
const FRAME_WIDTH = 1280;
const SHEET_WIDTH = 1024;

/** Encode one frame (at most 1280 wide) or a sheet of frames stacked at 1024 wide. */
export function encodeFrames(paths) {
  return encodeImages(paths, { width: FRAME_WIDTH, sheetWidth: SHEET_WIDTH });
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
  const images = planImages(steps).map(unit => ({
    label: unit.label,
    ...encode(unit.paths),
  }));
  return contentFor(prompt, images);
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
  call,
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
  const result = await sampleJudge({
    model,
    prompt,
    content: buildContent(prompt, walk.steps, encode),
    schema: buildBuyerSchema(walk.steps.map(step => step.stepId)),
    schemaName: 'buyer_forecast',
    samples,
    timeoutMs,
    parse: answer => parseBuyerSample(answer, walk.steps),
    ...(call ? { call } : {}),
  });
  return { ...result, route: ROUTE_ID };
}
