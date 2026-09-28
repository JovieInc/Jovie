/**
 * Golden-path recorded visual review (JOV-5489).
 *
 * Two independent reviewers judge each keyframe captured by the real-auth
 * Golden Path lane:
 *  - A: an economical vision model through the allowlisted AI Gateway, with a
 *       strict user-blocking rubric (never taste or polish).
 *  - B: the deterministic in-page layout audit recorded with the keyframe.
 * A suspected blocker only fails the gate once a replay of the journey flags
 * the same keyframe again. Model outages or unparseable answers are recorded
 * as `unknown`: never a pass, never a block.
 *
 *   tsx scripts/golden-path-visual-review.ts --dir <keyframes> --out <verdict.json> [--confirm-against <first-verdict.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export const RUBRIC_VERSION = 'golden-path-user-blocking/v1';
export const REVIEW_MODEL = 'zai/glm-5.3-flash';
const VERDICT_SCHEMA = 'jovie.golden-path-visual-review/v1';

export interface KeyframeRecord {
  readonly id: string;
  readonly sequence: number;
  readonly url: string;
  readonly file: string;
  readonly sha256: string;
  readonly audit: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly overflowPx: number;
    readonly offscreenInteractive: readonly string[];
    readonly smallTargets: readonly string[];
    readonly brokenImages: readonly string[];
  };
  readonly pageErrors: readonly string[];
}

export type ModelVerdict =
  | {
      readonly verdict: 'pass' | 'blocker';
      readonly findings: readonly string[];
    }
  | { readonly verdict: 'unknown'; readonly reason: string };

export interface KeyframeVerdict {
  readonly id: string;
  readonly sha256: string;
  readonly path: string;
  readonly layout: {
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly model: ModelVerdict;
  readonly suspected: boolean;
}

/** Reviewer B: hard, deterministic facts from the recorded layout audit. */
export function reviewLayout(record: KeyframeRecord) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (record.audit.overflowPx > 1)
    blockers.push(`page scrolls sideways by ${record.audit.overflowPx}px`);
  for (const el of record.audit.offscreenInteractive)
    blockers.push(`interactive element outside the viewport: ${el}`);
  for (const src of record.audit.brokenImages)
    blockers.push(`broken image: ${src}`);
  for (const error of record.pageErrors) {
    if (error.startsWith('pageerror:'))
      blockers.push(`uncaught error: ${error}`);
    else warnings.push(`console error: ${error}`);
  }
  for (const target of record.audit.smallTargets)
    warnings.push(`tap target under 24px: ${target}`);
  return { blockers, warnings };
}

export const RUBRIC_PROMPT = `You review one screenshot from a real user journey on a production web app.
Flag ONLY user-blocking visual defects:
1. layout: overlapping or clipped text/controls, content cut off, elements drawn on top of each other;
2. blank: a blank, error or crash screen, or a spinner/skeleton standing in for the main content;
3. contrast: primary text that is unreadable;
4. content: garbage shown to users (undefined, NaN, null, [object Object], lorem ipsum, raw translation keys);
5. action: the primary action is missing or visibly unusable.
Do NOT flag taste, brand, spacing preferences, empty-but-valid states or minor polish.
Reply with ONLY this JSON: {"verdict":"pass"|"blocker","findings":["<category>: <what and where>"]}`;

/** Parses the model reply; anything malformed is `unknown`, never a pass. */
export function parseModelVerdict(
  text: string | null | undefined
): ModelVerdict {
  if (!text) return { verdict: 'unknown', reason: 'empty reply' };
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start)
    return { verdict: 'unknown', reason: 'no JSON in reply' };
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as {
      verdict?: unknown;
      findings?: unknown;
    };
    const findings = Array.isArray(value.findings)
      ? value.findings
          .filter((f): f is string => typeof f === 'string')
          .map(f => f.slice(0, 300))
      : [];
    if (value.verdict === 'pass') return { verdict: 'pass', findings };
    if (value.verdict === 'blocker' && findings.length > 0)
      return { verdict: 'blocker', findings };
    return {
      verdict: 'unknown',
      reason: `unusable verdict: ${String(value.verdict)}`,
    };
  } catch {
    return { verdict: 'unknown', reason: 'invalid JSON' };
  }
}

/** Reviewer A: one keyframe through the allowlisted AI Gateway. */
export async function reviewWithModel(input: {
  readonly png: Buffer;
  readonly stepId: string;
  readonly path: string;
  readonly apiKey: string | undefined;
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}): Promise<ModelVerdict> {
  if (!input.apiKey) return { verdict: 'unknown', reason: 'no gateway key' };
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${input.baseUrl.replace(/\/$/u, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: REVIEW_MODEL,
          max_tokens: 1_500,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${RUBRIC_PROMPT}\n\nJourney step: ${input.stepId} (${input.path})`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${input.png.toString('base64')}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      }
    );
    if (!response.ok)
      return { verdict: 'unknown', reason: `gateway ${response.status}` };
    const body = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    return parseModelVerdict(body.choices?.[0]?.message?.content);
  } catch (error) {
    return {
      verdict: 'unknown',
      reason:
        error instanceof Error ? error.message.slice(0, 200) : 'request failed',
    };
  }
}

export function readManifest(dir: string): KeyframeRecord[] {
  return readFileSync(join(dir, 'manifest.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as KeyframeRecord);
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** A keyframe is confirmed only when the replay flags the same step again. */
export function confirmedBlockers(
  first: readonly KeyframeVerdict[],
  replay: readonly KeyframeVerdict[]
): string[] {
  const replaySuspected = new Set(
    replay.filter(v => v.suspected).map(v => v.id)
  );
  return first
    .filter(v => v.suspected && replaySuspected.has(v.id))
    .map(v => v.id);
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: Partial<NodeJS.ProcessEnv> = process.env,
  fetchImpl?: typeof fetch
) {
  const { values } = parseArgs({
    args: argv as string[],
    options: {
      dir: { type: 'string' },
      out: { type: 'string' },
      'confirm-against': { type: 'string' },
    },
  });
  if (!values.dir || !values.out)
    throw new Error('--dir and --out are required');
  const records = readManifest(values.dir);
  if (records.length === 0)
    throw new Error('no keyframes recorded; the capture did not run');
  const baseUrl =
    env.VISUAL_REVIEW_BASE_URL ?? 'https://ai-gateway.vercel.sh/v1';
  const verdicts: KeyframeVerdict[] = [];
  for (const record of records) {
    const layout = reviewLayout(record);
    const model = await reviewWithModel({
      png: readFileSync(join(values.dir, record.file)),
      stepId: record.id,
      path: pathOf(record.url),
      apiKey: env.AI_GATEWAY_API_KEY,
      baseUrl,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    const suspected = layout.blockers.length > 0 || model.verdict === 'blocker';
    verdicts.push({
      id: record.id,
      sha256: record.sha256,
      path: pathOf(record.url),
      layout,
      model,
      suspected,
    });
    console.log(
      `[golden-path-review] ${record.id}: layout=${layout.blockers.length ? 'BLOCKER' : 'ok'} model=${model.verdict}${suspected ? ' -> SUSPECTED' : ''}`
    );
    if (model.verdict === 'unknown')
      console.log(`  - model unavailable: ${model.reason}`);
    for (const line of [
      ...layout.blockers,
      ...(model.verdict === 'blocker' ? model.findings : []),
    ])
      console.log(`  - ${line}`);
  }
  const first = values['confirm-against']
    ? (
        JSON.parse(readFileSync(values['confirm-against'], 'utf8')) as {
          keyframes: KeyframeVerdict[];
        }
      ).keyframes
    : null;
  const confirmed = first ? confirmedBlockers(first, verdicts) : [];
  const suspected = verdicts.filter(v => v.suspected).map(v => v.id);
  writeFileSync(
    values.out,
    `${JSON.stringify(
      {
        schema: VERDICT_SCHEMA,
        rubricVersion: RUBRIC_VERSION,
        reviewers: {
          model: REVIEW_MODEL,
          layout: 'golden-path-layout-audit/v1',
        },
        reviewedAt: new Date().toISOString(),
        phase: first ? 'replay' : 'first',
        suspected,
        confirmed,
        keyframes: verdicts,
      },
      null,
      2
    )}\n`
  );
  console.log(
    `[golden-path-review] ${verdicts.length} keyframes, suspected=${suspected.length}${first ? `, confirmed=${confirmed.length}` : ''}`
  );
  if (first && confirmed.length > 0) process.exit(1);
}

if (process.argv[1]?.endsWith('golden-path-visual-review.ts')) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
