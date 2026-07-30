#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MAX_DIFF = 18_000;
const UI_FILE =
  /^(apps\/web\/(app|components|features|lib|public|styles|tests\/visual-qa)|packages\/ui|apps\/console\/.*screenshot|apps\/ios\/.*(View|Screen|Snapshot)|.*\.(css|scss|tsx|jsx))\//;
const SECRET =
  /(api[_-]?key|secret|password|token|private[_-]?key|database[_-]?url|authorization)\s*[:=]\s*[^\s,;]+/gi;
const GROK_MODEL = /grok[-_ ]?4(?:[._ -]?5)?/i;
const CODEX_MODEL =
  /(?:gpt[-_ ]?5(?:[._ -]?\d+)?(?:[-_ ]?codex)?|codex[-_ ]?[\w.-]+)/i;

export const REQUIRED_CAPTURE_VIEWPORTS = ['desktop', 'mobile'];

/** @typedef {{ apiKey?: string, baseUrl?: string, model?: string }} ReviewBackend */

export function sanitizeForPrompt(value) {
  return String(value ?? '')
    .replace(
      /(?:[A-Z][A-Z0-9]*_)*(?:API[_-]?KEY|SECRET|PASSWORD|TOKEN|PRIVATE[_-]?KEY)\s*[:=]\s*[^\s,;]+/gi,
      '[redacted-secret]'
    )
    .replace(SECRET, '[redacted-secret]');
}

export function routeChangedFiles(files) {
  const changed = files.filter(
    file => UI_FILE.test(file) || /(^|\/)DESIGN\.md$/.test(file)
  );
  if (changed.length === 0)
    return {
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
      review_status: 'skipped',
    };
  const routes = new Set();
  for (const file of changed) {
    if (/admin|console|ops/i.test(file)) routes.add('/demo/admin');
    else if (/dynamic|profile|username|artist/i.test(file))
      routes.add('/demo/profile');
    else if (/chat|shell/i.test(file)) routes.add('/app/chat');
    else routes.add('/');
  }
  // Every UI change gets one deterministic authenticated shell capture. Public
  // or demo surfaces alone are not evidence that app-shell changes render.
  routes.add('/app/chat');
  // Demo routes remain supplemental coverage; the authenticated shell capture
  // above is required evidence.
  routes.add('/demo');
  return {
    shouldReview: true,
    routes: [...routes].sort((a, b) =>
      a === '/'
        ? -1
        : b === '/'
          ? 1
          : a === '/demo'
            ? -1
            : b === '/demo'
              ? 1
              : a.localeCompare(b)
    ),
    reason: 'ui-change',
    review_status: 'advisory',
  };
}

/**
 * Validate that a capture manifest proves every requested route at every
 * required viewport. A partial manifest is evidence of a failed capture, not
 * a successful run with fewer screenshots.
 *
 * @param {{ routes?: unknown, viewports?: unknown, captures?: unknown }} manifest
 * @param {{ routes?: string[], viewportNames?: string[] }} [expected]
 */
export function validateCaptureManifest(manifest, expected = {}) {
  const routes = expected.routes ?? manifest?.routes;
  const viewportNames =
    expected.viewportNames ??
    (manifest?.viewports && typeof manifest.viewports === 'object'
      ? Object.keys(manifest.viewports)
      : REQUIRED_CAPTURE_VIEWPORTS);
  const captures = Array.isArray(manifest?.captures) ? manifest.captures : [];
  const failures = [];

  if (!Array.isArray(routes) || routes.length === 0)
    failures.push('no required routes');
  if (!Array.isArray(viewportNames) || viewportNames.length === 0)
    failures.push('no required viewports');

  const byTarget = new Map();
  for (const capture of captures) {
    if (!capture || typeof capture !== 'object') continue;
    const key = `${capture.route ?? ''}::${capture.viewport ?? ''}`;
    if (byTarget.has(key)) failures.push(`duplicate capture ${key}`);
    byTarget.set(key, capture);
  }

  for (const route of Array.isArray(routes) ? routes : []) {
    for (const viewport of Array.isArray(viewportNames) ? viewportNames : []) {
      const key = `${route}::${viewport}`;
      const capture = byTarget.get(key);
      if (!capture) {
        failures.push(`missing capture ${key}`);
        continue;
      }
      if (capture.status !== 'captured')
        failures.push(`failed capture ${key}: ${capture.error ?? 'unknown'}`);
      if (typeof capture.path !== 'string' || capture.path.length === 0)
        failures.push(`missing artifact path ${key}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

export function classifyReviewOutcome({
  shouldReview,
  mergeBaseAvailable = true,
  backendAvailable = true,
  timedOut = false,
}) {
  if (!shouldReview) return 'skipped';
  if (!mergeBaseAvailable || !backendAvailable || timedOut)
    return 'unavailable';
  return 'advisory';
}

export function classifyFinding(finding) {
  const subjective =
    /^(taste|preference|brand|identity|composition|copy-tone)$/i.test(
      String(finding?.category ?? '')
    );
  return {
    kind: subjective ? 'subjective' : 'objective',
    autoFollowUpEligible:
      !subjective &&
      ['high', 'medium'].includes(String(finding?.severity).toLowerCase()),
  };
}

export function buildReviewPrompt({ diff, changedFiles, screenshots }) {
  const safeDiff = sanitizeForPrompt(diff).slice(0, MAX_DIFF);
  const files = changedFiles.map(sanitizeForPrompt).slice(0, 80).join('\n');
  const images = screenshots.map(sanitizeForPrompt).join(', ');
  return `You are reviewing a Jovie UI PR. Return ONLY JSON matching this shape: {"summary":string,"findings":[{"title":string,"category":"layout|accessibility|responsive|functional|taste|preference|brand|identity|composition|copy-tone","severity":"high|medium|low","kind":"objective|subjective","evidence":string,"recommendation":string}],"backend":"grok-4.5|codex"}.\n\nRules: objective means an observable defect (overflow, clipping, inaccessible contrast/focus, broken interaction, missing content, desktop/mobile regression). Subjective means taste, preference, brand, identity, composition, or copy tone. Never turn a subjective finding into an auto-fix. Mention only evidence visible in the screenshots or grounded in the diff. Do not repeat secrets or credentials.\n\nChanged files:\n${files}\n\nDiff context:\n${safeDiff}\n\nScreenshots (desktop and mobile are paired per route): ${images}`;
}

function requireBackend({ apiKey, baseUrl, model, provider }) {
  const prefix = provider === 'grok' ? 'GROK' : 'CODEX';
  if (!apiKey)
    throw new Error(
      `backend_unconfigured: ${prefix}_VISUAL_REVIEW_API_KEY is missing`
    );
  if (!baseUrl)
    throw new Error(
      `backend_unconfigured: ${prefix}_VISUAL_REVIEW_BASE_URL is missing`
    );
  const allowed = provider === 'grok' ? GROK_MODEL : CODEX_MODEL;
  if (!allowed.test(model ?? ''))
    throw new Error(
      `backend_unconfigured: ${prefix}_VISUAL_REVIEW_MODEL is invalid`
    );
}

export async function reviewWithBackend({
  apiKey,
  baseUrl,
  model,
  provider = 'grok',
  prompt,
  images,
  timeoutMs = 90_000,
  fetchImpl = fetch,
}) {
  requireBackend({ apiKey, baseUrl, model, provider });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const content = [
      { type: 'text', text: prompt },
      ...images.map(data => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${data}` },
      })),
    ];
    const response = await fetchImpl(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 2_000,
          messages: [{ role: 'user', content }],
        }),
      }
    );
    if (!response.ok)
      throw new Error(`backend_failed: HTTP ${response.status}`);
    const payload = JSON.parse(JSON.stringify(await response.json()));
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0)
      throw new Error('backend_failed: empty response');
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {{ prompt: string, images: string[], timeoutMs?: number, fetchImpl?: typeof fetch, grok?: ReviewBackend, codex?: ReviewBackend }} options
 */
export async function reviewWithConfiguredBackends({
  prompt,
  images,
  timeoutMs = 90_000,
  fetchImpl = fetch,
  grok = {
    apiKey: process.env.GROK_VISUAL_REVIEW_API_KEY,
    baseUrl: process.env.GROK_VISUAL_REVIEW_BASE_URL,
    model: process.env.GROK_VISUAL_REVIEW_MODEL,
  },
  codex = {
    apiKey: process.env.CODEX_VISUAL_REVIEW_API_KEY,
    baseUrl: process.env.CODEX_VISUAL_REVIEW_BASE_URL,
    model: process.env.CODEX_VISUAL_REVIEW_MODEL,
  },
}) {
  /** @type {Array<['grok' | 'codex', ReviewBackend]>} */
  const attempts = [
    ['grok', grok],
    ['codex', codex],
  ];
  const errors = [];
  for (const [provider, backend] of attempts) {
    try {
      const review = await reviewWithBackend({
        apiKey: backend.apiKey ?? '',
        baseUrl: backend.baseUrl ?? '',
        model: backend.model ?? '',
        provider,
        prompt,
        images,
        timeoutMs,
        fetchImpl,
      });
      return { review: { ...review, backend: provider }, provider };
    } catch (error) {
      errors.push(`${provider}: ${String(error.message ?? error)}`);
    }
  }
  throw new Error(`backend_unavailable: ${errors.join('; ')}`);
}

export function normalizeFindings(review) {
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  return findings.map(finding => ({ ...finding, ...classifyFinding(finding) }));
}

export function formatReviewBody({
  review,
  runId,
  artifactUrl,
  prNumber,
  headSha,
  followUp = null,
}) {
  const findings = normalizeFindings(review);
  const objective = findings.filter(f => f.kind === 'objective');
  const subjective = findings.filter(f => f.kind === 'subjective');
  const render = rows =>
    rows.length
      ? rows
          .map(
            f =>
              `- **${f.severity} — ${f.title}** (${f.category})\n  Evidence: ${f.evidence}\n  Recommendation: ${f.recommendation}`
          )
          .join('\n')
      : '- None';
  return `${visualReviewIdentity({ prNumber, headSha, runId })}\n## Visual review (${runId})\n\n${review?.summary ?? 'No summary returned.'}\n\n### Objective findings\n${render(objective)}\n\n### Subjective / taste findings (review-only)\n${render(subjective)}\n\nArtifacts: ${artifactUrl}\n\nFollow-up: ${followUp ?? 'No automatic follow-up created. Subjective findings never create follow-up PRs.'}`;
}

/**
 * Stable provenance marker for an advisory review. Idempotence is scoped to an
 * exact PR, head SHA, and Actions run; a stale review must never suppress a
 * result for a new head or run.
 */
export function visualReviewIdentity({ prNumber, headSha, runId }) {
  if (!/^\d+$/.test(String(prNumber ?? '')))
    throw new Error('visual review identity requires a PR number');
  if (!/^[0-9a-f]{40}$/i.test(String(headSha ?? '')))
    throw new Error('visual review identity requires a 40-character head SHA');
  if (!/^\d+$/.test(String(runId ?? '')))
    throw new Error('visual review identity requires an Actions run ID');
  return `<!-- visual-review:pr=${prNumber};head=${headSha};run=${runId} -->`;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'route') {
    const files = JSON.parse(await readFile(args[0], 'utf8'));
    process.stdout.write(`${JSON.stringify(routeChangedFiles(files))}\n`);
    return;
  }
  if (command === 'prompt') {
    const input = JSON.parse(await readFile(args[0], 'utf8'));
    process.stdout.write(`${buildReviewPrompt(input)}\n`);
    return;
  }
  if (command === 'review') {
    const input = JSON.parse(await readFile(args[0], 'utf8'));
    const artifactDir = resolve(input.artifactDir);
    const manifest = JSON.parse(
      await readFile(join(artifactDir, 'manifest.json'), 'utf8')
    );
    const reviewStatus = input.reviewStatus ?? 'advisory';
    if (reviewStatus === 'skipped' || reviewStatus === 'unavailable') {
      await writeFile(
        input.output,
        JSON.stringify(
          {
            status: reviewStatus,
            review_status: reviewStatus,
            error:
              reviewStatus === 'skipped'
                ? 'No UI surface changed; visual review skipped.'
                : 'Merge base unavailable; visual review evidence is unavailable.',
          },
          null,
          2
        )
      );
      return;
    }
    const screenshots = [];
    for (const capture of manifest.captures ?? []) {
      if (capture.status !== 'captured') continue;
      screenshots.push(
        (await readFile(resolve(capture.path))).toString('base64')
      );
    }
    const prompt = buildReviewPrompt({
      diff: input.diff,
      changedFiles: input.changedFiles,
      screenshots:
        manifest.captures
          ?.filter(c => c.status === 'captured')
          .map(c => c.path) ?? [],
    });
    try {
      const { review, provider } = await reviewWithConfiguredBackends({
        prompt,
        images: screenshots,
      });
      await writeFile(
        input.output,
        JSON.stringify(
          {
            status: 'completed',
            review_status: 'advisory',
            review,
            provider,
            promptLength: prompt.length,
          },
          null,
          2
        )
      );
    } catch (error) {
      await writeFile(
        input.output,
        JSON.stringify(
          {
            status: 'unavailable',
            review_status: 'unavailable',
            error: String(error.message ?? error),
          },
          null,
          2
        )
      );
      process.exitCode = 0;
    }
    return;
  }
  throw new Error(
    'Usage: pr-visual-review.mjs route <files.json> | prompt <input.json>'
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
