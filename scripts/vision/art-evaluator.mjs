#!/usr/bin/env node
/**
 * Vision evaluator for generated hero/editorial art and virtual model renders
 * (JOV-6918, enforcing `background-never-focal`, `hero-art-one-shot` and
 * `virtual-model-passport` from canon/invariants.jsonl — JOV-INV-019).
 *
 * Two gates:
 *
 *   focal    — "What is the intended focal point, and is anything else
 *              competing with it?" Flags literal spheres/glass balls, rings,
 *              props, stage lights, particle or visualizer fields, textures
 *              that read as a recognizable material, and linear blur
 *              gradients standing in for optical depth.
 *
 *   identity — compares a people render against the model's canonical comp
 *              sheet and its `canon/virtual-models.json` passport (height,
 *              proportions, face structure, hair, eyes, traits). Wardrobe
 *              and shoot may vary; identity may not.
 *
 * Until Pen gains a reference-image-conditioned generator seeded from the
 * approved comp sheet, identity can drift across renders — this evaluator is
 * the gate.
 *
 * Transport is subscription-lane only: anthropic/* runs on the Claude Code
 * CLI, openai/* on the Codex CLI. There is deliberately no gateway or raw
 * API-key path.
 *
 * Usage:
 *   node scripts/vision/art-evaluator.mjs focal \
 *     --model openai/gpt-5.5 --image hero.png --brief "pricing hero"
 *   node scripts/vision/art-evaluator.mjs identity \
 *     --model anthropic/claude-opus-5.5 --id C05 --render render.png \
 *     --comps headshot.png three-quarter.png full-body-front.png profile.png
 *
 * Exit codes: 0 = pass verdict, 1 = fail verdict, 2 = usage/transport error.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VISION_EVAL_SCHEMA = 'jovie-vision-art-eval/v1';
export const PASSPORT_SCHEMA = 'jovie-virtual-model-passport/v1';
const REGISTRY_PATH = fileURLToPath(
  new URL('../../canon/virtual-models.json', import.meta.url)
);

/**
 * Competing-subject categories banned by `background-never-focal` and
 * `hero-art-one-shot`. The vision judge must answer with these slugs.
 */
export const BANNED_FOCAL_COMPETITORS = Object.freeze([
  'literal-sphere-or-glass-ball',
  'ring-or-torus',
  'prop-as-subject',
  'stage-light-or-fixture',
  'particle-or-visualizer-field',
  'recognizable-material-texture',
  'linear-blur-gradient',
]);

/** Identity fields a render may never contradict; styling and shoot vary. */
export const IDENTITY_FIELDS = Object.freeze([
  'sex',
  'age',
  'heightCm',
  'build',
  'shoeEu',
  'hair',
  'eyes',
  'face',
  'traits',
]);

const VERDICT_JSON_SHAPE = `{"status":"pass"|"fail","focalPoint":string|null,"competing":string[],"identityDrift":string[],"notes":string}`;

function requireImages(paths, what) {
  if (!Array.isArray(paths) || paths.length === 0)
    throw new Error(`${what} requires at least one image`);
  for (const path of paths)
    if (!existsSync(path)) throw new Error(`image not found: ${path}`);
  return paths.map(path => resolve(path));
}

/**
 * Focal-point evaluation request for a hero/editorial render. `brief` is the
 * declared art-direction intent (which element the composition is for and
 * what must stay focal: copy zone, product, subject).
 */
export function buildFocalEvaluation({ image, brief }) {
  const [resolved] = requireImages([image], 'focal evaluation');
  if (typeof brief !== 'string' || !brief.trim())
    throw new Error('focal evaluation requires a non-empty brief');
  const prompt = [
    `Evaluate this generated hero/editorial image for Jovie.`,
    `Intended composition brief: ${brief.trim()}`,
    ``,
    `Answer first: what is the intended focal point of this image, and is`,
    `anything else competing with it?`,
    ``,
    `A passing image reserves its focal plane for the intended subject and`,
    `lets depth fall off optically (wide-aperture 85mm feel), never as a blur`,
    `mask or a linear sharp-to-blur gradient. Backgrounds are abstract light,`,
    `atmosphere, restrained geometry, light leaks or low-detail texture only.`,
    `If the eye reaches the background before the intended subject, it fails.`,
    ``,
    `Fail the image when you see any competing element, including:`,
    ...BANNED_FOCAL_COMPETITORS.map(code => `- ${code}`),
    ``,
    `List every competing element you observe in "competing" using these`,
    `codes. Return ONLY JSON: ${VERDICT_JSON_SHAPE}`,
  ].join('\n');
  return { mode: 'focal', prompt, images: [resolved] };
}

/** Load the canonical virtual-model passport registry. */
export function loadPassports(registryPath = REGISTRY_PATH) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  if (registry.schema !== PASSPORT_SCHEMA)
    throw new Error(`unsupported passport schema: ${registry.schema}`);
  return registry;
}

/**
 * Resolve one approved model's passport. Identity evaluation binds to the
 * passport, never to a free-text description of a person.
 */
export function resolvePassport(registry, modelId) {
  const model = registry.models?.find(entry => entry.id === modelId);
  if (!model) throw new Error(`unknown virtual model: ${modelId}`);
  if (registry.removed?.includes(modelId))
    throw new Error(`virtual model ${modelId} is removed`);
  if (model.status !== 'approved')
    throw new Error(`virtual model ${modelId} is not approved`);
  return model;
}

/**
 * Identity-drift evaluation request. `comps` are the model's approved comp
 * sheet views (headshot, three-quarter, full-body-front, profile); the render
 * is compared against them and the passport.
 */
export function buildIdentityEvaluation({
  modelId,
  render,
  comps,
  registry = loadPassports(),
}) {
  const model = resolvePassport(registry, modelId);
  const [renderPath] = requireImages([render], 'identity evaluation');
  const compPaths = requireImages(comps, 'identity evaluation');
  if (compPaths.length !== registry.views.length)
    throw new Error(
      `identity evaluation requires ${registry.views.length} comp views: ${registry.views.join(', ')}`
    );
  const passport = IDENTITY_FIELDS.map(field => {
    const value = model[field];
    return `- ${field}: ${Array.isArray(value) ? value.join('; ') : value}`;
  }).join('\n');
  const prompt = [
    `You are the identity gate for Jovie virtual model ${modelId}.`,
    `The first ${compPaths.length} attached images are the approved comp`,
    `sheet views (${registry.views.join(', ')}); the last attached image is`,
    `a new campaign render under evaluation.`,
    ``,
    `The passport fixes identity:`,
    passport,
    ``,
    `Wardrobe, hair styling, makeup, accessories, pose, lens, framing, light,`,
    `location and expression vary per shoot and never count as drift. Compare`,
    `the render's person to the comp sheet and passport: height/proportions,`,
    `build, face structure, hair color and cut, eyes, and identifying traits.`,
    `Identity may not drift.`,
    ``,
    `List every identity contradiction in "identityDrift". Return ONLY JSON:`,
    VERDICT_JSON_SHAPE,
  ].join('\n');
  return {
    mode: 'identity',
    modelId,
    prompt,
    images: [...compPaths, renderPath],
  };
}

/**
 * Strict verdict parsing: the judge must return the declared JSON shape, and
 * any competing element or identity drift turns the verdict into a fail.
 */
export function parseVerdict(text) {
  if (typeof text !== 'string') throw new Error('verdict must be text');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('verdict: no JSON object in judge output');
  let verdict;
  try {
    verdict = JSON.parse(match[0]);
  } catch {
    throw new Error('verdict: unparseable judge JSON');
  }
  if (
    verdict === null ||
    typeof verdict !== 'object' ||
    !['pass', 'fail'].includes(verdict.status) ||
    !Array.isArray(verdict.competing) ||
    !Array.isArray(verdict.identityDrift)
  )
    throw new Error('verdict: shape is invalid');
  const competing = verdict.competing.map(code => String(code));
  const identityDrift = verdict.identityDrift.map(note => String(note));
  return Object.freeze({
    status: competing.length || identityDrift.length ? 'fail' : verdict.status,
    focalPoint:
      typeof verdict.focalPoint === 'string' ? verdict.focalPoint : null,
    competing: Object.freeze(competing),
    identityDrift: Object.freeze(identityDrift),
    notes: typeof verdict.notes === 'string' ? verdict.notes : '',
  });
}

/**
 * Run one evaluation request through a transport and normalize to a gate
 * verdict. Transport/judge failure fails closed.
 */
export async function evaluateArt(request, transport) {
  const started = Date.now();
  try {
    const text = await transport({
      system:
        'You are a strict art-direction evaluator for Jovie generated imagery. ' +
        'You only report what is visible in the attached images. ' +
        'You answer with JSON and nothing else.',
      prompt: request.prompt,
      images: request.images,
      model: request.judgeModel,
    });
    const verdict = parseVerdict(text);
    return {
      schema: VISION_EVAL_SCHEMA,
      ok: verdict.status === 'pass',
      mode: request.mode,
      modelId: request.modelId ?? null,
      verdict,
      judgeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      schema: VISION_EVAL_SCHEMA,
      ok: false,
      mode: request.mode,
      modelId: request.modelId ?? null,
      verdict: null,
      error: error instanceof Error ? error.message : String(error),
      judgeMs: Date.now() - started,
    };
  }
}

const BUNDLED_CODEX =
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const CODEX_BIN =
  process.env.CODEX_BIN ??
  process.env.HERMES_CODEX_BIN ??
  (existsSync(BUNDLED_CODEX) ? BUNDLED_CODEX : 'codex');

/**
 * Subscription-lane vision transport. anthropic/* runs on the Claude Code CLI
 * (the judge reads the image paths with Read); openai/* runs on Codex exec
 * with `-i` image attachments. There is no API-key path: any other family or
 * a supplied apiKey throws.
 */
export function subscriptionVisionTransport({ spawnImpl = spawnSync } = {}) {
  const run = (bin, args, input, cwd = tmpdir()) => {
    const result = spawnImpl(bin, args, {
      input,
      cwd,
      encoding: 'utf8',
      timeout: 240_000,
      maxBuffer: 8 << 20,
      env: { ...process.env, AI_GATEWAY_API_KEY: undefined },
    });
    if (result.status !== 0)
      throw new Error(
        `${bin} exited ${result.status}: ${(result.stderr ?? '').slice(0, 160)}`
      );
    return result.stdout;
  };
  return async ({ model, system, prompt, images = [] }) => {
    const [family, name = ''] = String(model ?? '').split('/');
    if (!name) throw new Error(`model "${model}" needs a family/name pair`);
    const input = `${system}\n\n${prompt}`;
    if (family === 'openai') {
      const dir = mkdtempSync(join(tmpdir(), 'vision-eval-'));
      try {
        run(
          CODEX_BIN,
          [
            'exec',
            '-c',
            'features.hooks=false',
            '-c',
            'features.codex_hooks=false',
            '--skip-git-repo-check',
            '--sandbox',
            'read-only',
            '-m',
            name,
            ...images.flatMap(path => ['-i', path]),
            '-o',
            join(dir, 'out.txt'),
            '-',
          ],
          input,
          dir
        );
        return readFileSync(join(dir, 'out.txt'), 'utf8');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (family === 'anthropic') {
      const paths = images.map(path => `- ${path}`).join('\n');
      return run(
        'claude',
        [
          '-p',
          '--model',
          name.replace(/\./g, '-'),
          '--output-format',
          'text',
          '--no-session-persistence',
          '--allowedTools',
          'Read',
          '--disallowedTools',
          'Bash,Edit,Write,WebFetch,WebSearch',
        ],
        `${input}\n\nEvaluate these image files by reading them:\n${paths}`
      );
    }
    throw new Error(
      `no subscription lane for model "${model}" — use anthropic/* (claude CLI) or openai/* (codex CLI); raw API keys are not permitted`
    );
  };
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(argv) {
  const [mode, ...rest] = argv;
  const judgeModel = flagValue(rest, '--model');
  if (!judgeModel || !/^(anthropic|openai)\//.test(judgeModel))
    throw new Error(
      '--model must be a subscription-lane judge (anthropic/* or openai/*)'
    );
  let request;
  if (mode === 'focal') {
    request = buildFocalEvaluation({
      image: flagValue(rest, '--image'),
      brief: flagValue(rest, '--brief') ?? '',
    });
  } else if (mode === 'identity') {
    const compsIndex = rest.indexOf('--comps');
    request = buildIdentityEvaluation({
      modelId: flagValue(rest, '--id'),
      render: flagValue(rest, '--render'),
      comps: compsIndex >= 0 ? rest.slice(compsIndex + 1) : [],
    });
  } else {
    throw new Error('usage: art-evaluator.mjs focal|identity ...');
  }
  const result = await evaluateArt(
    { ...request, judgeModel },
    subscriptionVisionTransport()
  );
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && basename(process.argv[1]) === 'art-evaluator.mjs') {
  main(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    });
}
