#!/usr/bin/env node
/**
 * Pen-as-SoT citation check (JOV-13066): deterministic, NON-required.
 *
 * Founder rule (jovie-website-constitution / pen-taste-surface-gate): Pen is
 * the taste source of truth until Tim approves; Figma and Paper are scratch
 * or reference surfaces and are never publishable SoT. Source: Aeon
 * Figma/design-system review, finding 1 — a Figma-sourced marketing visual
 * direction was treated as canonical with no Pen approval reference.
 *
 * Contract: a PR whose diff touches a marketing VISUAL surface must either
 *   (a) cite an approved Pen node in the PR body
 *       (a `Pen` reference carrying a node/file id), or
 *   (b) state `no visual change` explicitly in the PR body.
 * Anything else fails. This is a body/diff check, not an LLM reviewer; a
 * check that fails is resolved by citing the Pen node or marking no visual
 * change — never by inventing a Figma-as-SoT path.
 *
 * Inputs:
 *   --files-file PATH  newline-separated changed-file list (required)
 *   --body-file PATH   the proposed PR body (falls back to --body)
 *   --body TEXT        the PR body inline
 *   --strict           (default) exit 1 on a missing citation; without it
 *                      the check reports and exits 0 (informational mode —
 *                      the promotion target per
 *                      apps/web/review-findings/README.md)
 *
 * Marketing visual surfaces: apps/web/{app/(home),app/(marketing),
 * components/marketing,components/site,components/features/home}/**.tsx|.css
 * plus packages/ui/**.tsx. Tests/stories/md are not visual sources.
 *
 * CLI:
 *   node scripts/check-pen-citation.mjs --files-file F [--body-file B | --body T] [--lenient]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const MARKETING_VISUAL_RE =
  /^apps\/web\/(?:app\/\((?:home|marketing)\)|components\/(?:marketing|site)|components\/features\/home)\/.*\.(?:tsx|css)$|^packages\/ui\/.*\.tsx$/;
const NON_VISUAL_RE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\.md$|\u0000/;

/** @returns {{ code: 0 | 1 | 2, reason: string }} */
export function checkPenCitation({
  files,
  body,
  lenient = false,
  log = (...a) => console.log(...a),
  error = (...a) => console.error(...a),
}) {
  const visual = files.filter(
    path => MARKETING_VISUAL_RE.test(path) && !NON_VISUAL_RE.test(path)
  );
  if (visual.length === 0) {
    log('check-pen-citation: no marketing visual surfaces changed — ok');
    return { code: 0, reason: 'no-visual-diff' };
  }
  const text = body ?? '';
  const citesPen = /\bpen\b[^\n]{0,80}\b[a-z0-9]{4,}\b/i.test(text);
  const saysNoVisualChange = /no visual change/i.test(text);
  if (citesPen || saysNoVisualChange) {
    log(
      `check-pen-citation: ok — ${citesPen ? 'Pen approval cited' : '"no visual change" stated'} (${visual.length} visual file(s))`
    );
    return { code: 0, reason: citesPen ? 'pen-cited' : 'no-visual-change' };
  }
  const message = `check-pen-citation: ${visual.length} marketing visual file(s) changed but the PR body cites no approved Pen node and does not state "no visual change". Cite the Pen node (taste SoT until Tim approves; Figma/Paper are scratch/reference, never publishable SoT) or state "no visual change". Files: ${visual.slice(0, 5).join(', ')}${visual.length > 5 ? ` … +${visual.length - 5} more` : ''}`;
  if (lenient) {
    log(`[lenient] ${message}`);
    return { code: 0, reason: 'missing-citation-lenient' };
  }
  error(message);
  return { code: 1, reason: 'missing-citation' };
}

export function main(argv = process.argv.slice(2)) {
  // parseArgs reads `args`. A key named `argv` is ignored.
  const { values } = parseArgs({
    args: argv,
    options: {
      'files-file': { type: 'string' },
      'body-file': { type: 'string' },
      body: { type: 'string' },
      lenient: { type: 'boolean', default: false },
    },
  });
  if (!values['files-file']) {
    console.error('check-pen-citation: --files-file is required');
    return 2;
  }
  const files = readFileSync(values['files-file'], 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const body = values['body-file']
    ? readFileSync(values['body-file'], 'utf8')
    : (values.body ?? '');
  return checkPenCitation({ files, body, lenient: values.lenient }).code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
