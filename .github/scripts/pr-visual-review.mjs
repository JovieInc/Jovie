#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const MAX_DIFF = 18_000;
const UI_FILE =
  /^(apps\/web\/(app|components|features|lib|public|styles|tests\/visual-qa)|packages\/ui|apps\/console\/.*screenshot|apps\/ios\/.*(View|Screen|Snapshot)|.*\.(css|scss|tsx|jsx))\//;
const SECRET =
  /(api[_-]?key|secret|password|token|private[_-]?key|database[_-]?url|authorization)\s*[:=]\s*[^\s,;]+/gi;
const ALLOWED_MODELS = /(?:glm[-_ ]?5(?:\.2)?|kimi[-_ ]?k3)/i;

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
    return { shouldReview: false, routes: [], reason: 'no-ui-change' };
  const routes = new Set();
  for (const file of changed) {
    if (/admin|console|ops/i.test(file)) routes.add('/demo/admin');
    else if (/dynamic|profile|username|artist/i.test(file))
      routes.add('/demo/profile');
    else if (/chat|shell/i.test(file)) routes.add('/app/chat');
    else routes.add('/');
  }
  // Demo routes are deterministic; chat/shell routes use the seeded test-auth
  // app surface above so captures show the changed authenticated chrome.
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
  };
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
  return `You are reviewing a Jovie UI PR. Return ONLY JSON matching this shape: {"summary":string,"findings":[{"title":string,"category":"layout|accessibility|responsive|functional|taste|preference|brand|identity|composition|copy-tone","severity":"high|medium|low","kind":"objective|subjective","evidence":string,"recommendation":string}],"backend":"glm-5.2|kimi-k3"}.\n\nRules: objective means an observable defect (overflow, clipping, inaccessible contrast/focus, broken interaction, missing content, desktop/mobile regression). Subjective means taste, preference, brand, identity, composition, or copy tone. Never turn a subjective finding into an auto-fix. Mention only evidence visible in the screenshots or grounded in the diff. Do not repeat secrets or credentials.\n\nChanged files:\n${files}\n\nDiff context:\n${safeDiff}\n\nScreenshots (desktop and mobile are paired per route): ${images}`;
}

function requireBackend({ apiKey, baseUrl, model }) {
  if (!apiKey)
    throw new Error('backend_unconfigured: VISUAL_REVIEW_API_KEY is missing');
  if (!baseUrl)
    throw new Error('backend_unconfigured: VISUAL_REVIEW_BASE_URL is missing');
  if (!ALLOWED_MODELS.test(model ?? ''))
    throw new Error(
      'backend_unconfigured: VISUAL_REVIEW_MODEL must be GLM 5.2 or Kimi K3'
    );
}

export async function reviewWithBackend({
  apiKey,
  baseUrl,
  model,
  prompt,
  images,
  timeoutMs = 90_000,
  fetchImpl = fetch,
}) {
  requireBackend({ apiKey, baseUrl, model });
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

export function normalizeFindings(review) {
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  return findings.map(finding => ({ ...finding, ...classifyFinding(finding) }));
}

export function formatReviewBody({
  review,
  runId,
  artifactUrl,
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
  return `## Visual review (${runId})\n\n${review?.summary ?? 'No summary returned.'}\n\n### Objective findings\n${render(objective)}\n\n### Subjective / taste findings (review-only)\n${render(subjective)}\n\nArtifacts: ${artifactUrl}\n\nFollow-up: ${followUp ?? 'No automatic follow-up created. Subjective findings never create follow-up PRs.'}`;
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
      const review = await reviewWithBackend({
        apiKey: process.env.VISUAL_REVIEW_API_KEY,
        baseUrl: process.env.VISUAL_REVIEW_BASE_URL,
        model: process.env.VISUAL_REVIEW_MODEL,
        prompt,
        images: screenshots,
      });
      await writeFile(
        input.output,
        JSON.stringify(
          { status: 'completed', review, promptLength: prompt.length },
          null,
          2
        )
      );
    } catch (error) {
      await writeFile(
        input.output,
        JSON.stringify(
          {
            status: error.name === 'AbortError' ? 'timed_out' : 'blocked',
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
