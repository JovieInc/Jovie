// Automated vision review for the production dogfood agent: a cheap vision
// model reads each screenshot against the page's expected state, a second call
// must confirm any claimed defect, and only confirmed findings become checks.
// Network is injected (fetchImpl) so the logic is hermetic in tests.
import { createHash } from 'node:crypto';

export const VISION_MODEL_DEFAULT = 'anthropic/claude-haiku-4.5';
export const VISION_GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1';
export const VISION_CATEGORIES = [
  'layout',
  'clipped-text',
  'missing-image',
  'error-state',
  'empty-state',
  'placeholder-copy',
  'contrast',
  'other',
];

const COMMON =
  'Ignore the cookie-consent banner and browser chrome. Judge only what is visible. Report a defect only if you are sure a real user would notice it: broken or overlapping layout, clipped or truncated text, a missing or broken image, an error message, an empty state where content is expected, placeholder/lorem/debug copy, or unreadable contrast. Do not report taste or style preferences.';

export const PAGE_EXPECTATIONS = {
  profile:
    'Public artist profile for Tim White: avatar with verified badge, name, handle, a featured release with artwork and a Play button, social/Get Updates actions, bottom or top navigation (Home, Music, Events, About).',
  release:
    'Public release page: cover artwork, release title, artist credit, and at least one streaming destination button (for example Stream Now, Spotify, Apple Music).',
  'dashboard-home':
    'Signed-in artist app home: sidebar navigation and a main area with real content for the artist (not a blank page, spinner or error).',
  'dashboard-audience':
    'Signed-in Audience page: a heading and an audience list or an intentional empty state with a clear explanation.',
  'dashboard-releases':
    'Signed-in Releases page: a list or table of releases with titles and artwork, or an intentional empty state.',
  'dashboard-library':
    'Signed-in Library page: assets/releases content or an intentional empty state.',
  'dashboard-earnings':
    'Signed-in Earnings page: earnings figures or an intentional empty state.',
  'dashboard-insights':
    'Signed-in Insights page: insight cards or an intentional empty state.',
  chat: 'Signed-in chat: a conversation area and a message composer at the bottom ready for input.',
};

export function expectationFor(page) {
  return (
    PAGE_EXPECTATIONS[page] ?? 'A complete, correctly laid-out product page.'
  );
}

export function reviewPrompt(expectation, viewport) {
  return `You are a QA reviewer looking at a production screenshot (${viewport} viewport).\nExpected state: ${expectation}\n${COMMON}\nReply with JSON only: {"verdict":"ok"|"defect","findings":[{"category":"${VISION_CATEGORIES.join('|')}","severity":"P2"|"P3","summary":"<one sentence>","where":"<region of the page>"}]}. Use verdict "ok" with an empty findings array when nothing is wrong.`;
}

export function confirmPrompt(expectation, finding) {
  return `A reviewer claimed this defect on the attached production screenshot: "${finding.summary}" (${finding.where ?? 'unspecified region'}).\nExpected state: ${expectation}\n${COMMON}\nLook again. Reply with JSON only: {"confirmed":true|false,"reason":"<one sentence>"}. Say confirmed only if the defect is clearly visible.`;
}

/** Tolerant parse: models sometimes wrap JSON in prose or fences. */
export function parseJsonObject(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseVerdict(text) {
  const obj = parseJsonObject(text);
  if (!obj || (obj.verdict !== 'ok' && obj.verdict !== 'defect')) return null;
  const findings = (Array.isArray(obj.findings) ? obj.findings : [])
    .filter(f => f && typeof f.summary === 'string' && f.summary.trim())
    .map(f => ({
      category: VISION_CATEGORIES.includes(f.category) ? f.category : 'other',
      severity: f.severity === 'P3' ? 'P3' : 'P2',
      summary: f.summary.trim().slice(0, 240),
      where: typeof f.where === 'string' ? f.where.slice(0, 120) : '',
    }));
  return { verdict: findings.length > 0 ? 'defect' : 'ok', findings };
}

async function ask({ apiKey, model, baseUrl, fetchImpl, text, dataUrl }) {
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok)
    return { ok: false, reason: `gateway HTTP ${res.status}`, usage: null };
  const body = await res.json().catch(() => null);
  return {
    ok: true,
    text: body?.choices?.[0]?.message?.content ?? '',
    usage: body?.usage ?? null,
  };
}

/**
 * @returns {{ok:boolean, reason?:string, findings:object[], usage:object[], imageSha:string}}
 */
export async function reviewScreenshot({
  bytes,
  expectation,
  viewport,
  apiKey,
  model = VISION_MODEL_DEFAULT,
  baseUrl = VISION_GATEWAY_BASE,
  fetchImpl = fetch,
}) {
  const imageSha = createHash('sha256')
    .update(bytes)
    .digest('hex')
    .slice(0, 12);
  if (!apiKey)
    return {
      ok: false,
      reason: 'no AI_GATEWAY_API_KEY',
      findings: [],
      usage: [],
      imageSha,
    };
  const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const usage = [];
  try {
    const first = await ask({
      apiKey,
      model,
      baseUrl,
      fetchImpl,
      text: reviewPrompt(expectation, viewport),
      dataUrl,
    });
    if (first.usage) usage.push(first.usage);
    if (!first.ok)
      return { ok: false, reason: first.reason, findings: [], usage, imageSha };
    const verdict = parseVerdict(first.text);
    if (!verdict)
      return {
        ok: false,
        reason: 'unparsable verdict',
        findings: [],
        usage,
        imageSha,
      };
    const confirmed = [];
    for (const finding of verdict.findings.slice(0, 3)) {
      const second = await ask({
        apiKey,
        model,
        baseUrl,
        fetchImpl,
        text: confirmPrompt(expectation, finding),
        dataUrl,
      });
      if (second.usage) usage.push(second.usage);
      if (second.ok && parseJsonObject(second.text)?.confirmed === true)
        confirmed.push(finding);
    }
    return { ok: true, findings: confirmed, usage, imageSha };
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.message ?? error).split('\n')[0],
      findings: [],
      usage,
      imageSha,
    };
  }
}

/** One check per shot: failed (confirmed findings), passed, or unverified (review could not run). */
export function visionChecksFor({ shot, review }) {
  const target = `${shot.url}#${shot.viewport}`;
  const base = {
    id: 'vision-review',
    mission: shot.mission,
    page: shot.page,
    screenshot: shot.file,
  };
  if (!review.ok)
    return [
      {
        ...base,
        target,
        status: 'unverified',
        summary: `vision review did not run: ${review.reason}`,
      },
    ];
  if (review.findings.length === 0)
    return [
      {
        ...base,
        target,
        status: 'passed',
        summary: 'vision review found nothing',
      },
    ];
  return review.findings.map(f => ({
    ...base,
    // One issue per page, viewport and defect category; model wording varies run to run.
    target: `${target}#${f.category}`,
    status: 'failed',
    severity: f.severity,
    summary: `vision review: ${f.category} on ${shot.page} (${shot.viewport})`,
    expected: shot.expectation,
    actual: `${f.summary}${f.where ? ` [${f.where}]` : ''}`,
    url: shot.url,
  }));
}

export function sumUsage(reviews) {
  const total = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  for (const r of reviews) {
    for (const u of r.usage ?? []) {
      total.prompt_tokens += u.prompt_tokens ?? 0;
      total.completion_tokens += u.completion_tokens ?? 0;
      total.calls += 1;
    }
  }
  return total;
}
