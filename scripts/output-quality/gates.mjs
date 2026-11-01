// The deterministic gates every output passes before its audience-intent eval
// (canon: JovieInc/ci canon/OUTPUT-QUALITY-LOOP.md). Each gate reuses the
// existing source of truth and adds no rule list of its own:
//   copy    @jovie/copy lint (packages/copy/rules.ts, policy canon/VOICE.md)
//   slop    anti-slop registry matchers (docs/design-system/anti-slop-rules.json)
//   design  design tokens only (no raw colors outside custom properties), plus
//           the Clef screenshot rules (scripts/invariants/clef-screenshot-evaluator.mjs)
//   claims  the claims ledger (fundraising registry claims.yaml + metrics.yaml)
//   privacy no secrets, no personal contact data
// Harm and the brand line (legal, harms and targets no one) are judged by the
// copy lint floor (harm/legal/privacy categories) and by the intent judge.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lintCopy } from '../../packages/copy/lint.ts';
import { loadRegistry, REPO_ROOT } from '../anti-slop/lib.mjs';
import { runMatchers } from '../anti-slop/run.mjs';

export const KINDS = Object.freeze({
  memo: { register: 'founder-tim', external: false, visual: false },
  doc: { register: 'founder-tim', external: false, visual: false },
  sms: { register: 'jovie-transactional', external: false, visual: false },
  email: { register: 'jovie-transactional', external: true, visual: false },
  social: { register: 'jovie-persona', external: true, visual: true },
  video: { register: 'jovie-marketing', external: true, visual: true },
  deck: { register: 'founder-tim', external: true, visual: true },
  investor: { register: 'founder-tim', external: true, visual: true },
  ui: { register: 'jovie-product-ui', external: true, visual: true },
  artifact: { register: 'founder-tim', external: false, visual: true },
});

export const DEFAULT_LEDGER = join(
  homedir(),
  'conductor/ops-wt/fundraising/registry'
);

const finding = (gate, severity, message, match = '') => ({
  gate,
  severity,
  message,
  match: String(match).slice(0, 120),
});

/** Gate status from findings: any block -> fail, any warn -> warn. */
export function gateStatus(findings) {
  if (findings.some(f => f.severity === 'block')) return 'fail';
  return findings.length ? 'warn' : 'pass';
}

export function copyGate(text, register) {
  if (!text.trim()) return [];
  const result = lintCopy(text, { register });
  return result.findings.map(f =>
    finding(
      'copy',
      f.severity === 'block' ? 'block' : 'warn',
      `${f.rule}: ${f.message}`,
      f.match
    )
  );
}

export function slopGate(path, root = REPO_ROOT) {
  if (!path || !existsSync(path)) return [];
  return runMatchers(loadRegistry(root), [path], root).map(f =>
    finding(
      'slop',
      f.severity === 'block' || f.severity === 'error' ? 'block' : 'warn',
      `${f.id} (line ${f.line})`,
      f.text
    )
  );
}

const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/giu;

/**
 * Design-system tokens only: a color literal is allowed solely as the value
 * of a CSS custom property (the token definition); every other use must be
 * var(--token). Pages with no var(--...) at all are not on the system.
 */
export function designTokenGate(html) {
  const findings = [];
  const css = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)]
    .map(m => m[1])
    .join('\n');
  const inline = [...String(html).matchAll(/\bstyle="([^"]*)"/giu)].map(
    m => m[1]
  );
  const declarations = [
    ...css.split(/[;{}]/u),
    ...inline.flatMap(s => s.split(';')),
  ];
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('@'))
      continue;
    const raw = trimmed.match(RAW_COLOR);
    if (raw)
      findings.push(
        finding(
          'design',
          'block',
          'raw color outside a design token; use var(--token)',
          trimmed
        )
      );
  }
  if ((css || inline.length) && !/var\(--/u.test(`${css}${inline.join(';')}`))
    findings.push(
      finding(
        'design',
        'block',
        'no design tokens used (no var(--...)); build on the Jovie design system'
      )
    );
  if (css && !/prefers-color-scheme|data-theme|color-scheme/iu.test(css))
    findings.push(
      finding(
        'design',
        'warn',
        'no color-scheme handling; Jovie output is dark-mode first'
      )
    );
  return findings.slice(0, 25);
}

/** Clef (system-1, Workers AI) against the visually checkable DESIGN.md rules. */
export async function designScreenshotGate(images, { kind, evaluate } = {}) {
  if (!images.length) return [];
  const run =
    evaluate ??
    (await import('../invariants/clef-screenshot-evaluator.mjs'))
      .evaluateScreenshots;
  const views = images
    .slice(0, 2)
    .map(image => ({ label: image.label, overview: readFileSync(image.path) }));
  try {
    const result = await run(views, {
      profile: kind === 'ui' ? 'app' : 'marketing',
    });
    if (result.pass === null)
      return [
        finding(
          'design',
          'warn',
          `Clef screenshot rules unavailable (${result.status})`
        ),
      ];
    return (result.failed ?? []).map(id =>
      finding('design', 'block', `Clef design rule failed: ${id}`)
    );
  } catch (error) {
    return [
      finding(
        'design',
        'warn',
        `Clef screenshot rules unavailable: ${String(error?.message ?? error).slice(0, 100)}`
      ),
    ];
  }
}

// Claim-like numbers, ported from the ledger's own lint (registry/claims_lint.py).
const NUM = new RegExp(
  [
    String.raw`\$\d[\d,.]*(?:[MK]\b|/mo(?:nth)?\b| a month\b)?`,
    String.raw`\b\d[\d,.]*(?:M\+?|K)(?![A-Za-z])`,
    String.raw`\b\d[\d,.]*\s?(?:%|million|billion)`,
    String.raw`\b\d{1,3}(?:,\d{3})+\b`,
    String.raw`\b\d{2,}\+`,
    String.raw`\b\d+ (?:years|singles|shows|artists|days|months|subscribers|streams|views|listeners|fans|users|customers)\b`,
  ].join('|'),
  'giu'
);
const norm = s =>
  String(s)
    .replace(/ a month|\/month|\/mo/giu, '')
    .toLowerCase()
    .trim();

/** Every number string the ledger and metrics vouch for, or null when there is no ledger. */
export async function loadLedger(
  dir = process.env.JOVIE_CLAIMS_LEDGER ?? DEFAULT_LEDGER
) {
  const claimsPath = join(dir, 'claims.yaml');
  if (!existsSync(claimsPath)) return null;
  const { load } = await import('js-yaml');
  const covered = new Set();
  const claims = load(readFileSync(claimsPath, 'utf8'))?.claims ?? {};
  for (const claim of Object.values(claims))
    for (const value of claim?.values ?? []) covered.add(norm(value));
  const metricsPath = join(dir, 'metrics.yaml');
  if (existsSync(metricsPath)) {
    const metrics = load(readFileSync(metricsPath, 'utf8')) ?? {};
    for (const kind of ['metrics', 'facts'])
      for (const row of Object.values(metrics[kind] ?? {}))
        for (const value of [row?.value, row?.display, ...(row?.values ?? [])])
          if (value != null) covered.add(norm(value));
  }
  return { dir, covered };
}

/** Claim-like numbers in the text that no ledger claim or metric covers. */
export function claimsGate(text, ledger, { external }) {
  const severity = external ? 'block' : 'warn';
  const numbers = [
    ...new Set([...String(text).matchAll(NUM)].map(m => m[0].trim())),
  ];
  if (!numbers.length) return [];
  if (!ledger)
    return [
      finding(
        'claims',
        severity,
        'claims ledger not found (set JOVIE_CLAIMS_LEDGER); numbers are unverified',
        numbers.join(', ')
      ),
    ];
  const bare = s => norm(s).replace(/\+$/u, '');
  const vouched = new Set([...ledger.covered].map(bare));
  const uncovered = numbers.filter(n => !vouched.has(bare(n)));
  return uncovered.map(n =>
    finding(
      'claims',
      severity,
      'claim-like number not in the claims ledger (add it with a source and as-of date, or drop it)',
      n
    )
  );
}

const SECRET =
  /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gh[osu]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/gu;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/gu;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/gu;
const OWN_DOMAINS = /(?:^|\.)(?:jov\.ie|jovie\.com|example\.(?:com|org))$/iu;

export function privacyGate(text) {
  const out = [];
  for (const m of String(text).matchAll(SECRET))
    out.push(
      finding(
        'privacy',
        'block',
        'credential-shaped string',
        `${m[0].slice(0, 6)}...`
      )
    );
  for (const m of String(text).matchAll(EMAIL))
    if (!OWN_DOMAINS.test(m[1]))
      out.push(
        finding(
          'privacy',
          'warn',
          'personal email address; confirm consent or remove',
          m[0]
        )
      );
  for (const m of String(text).matchAll(PHONE))
    out.push(
      finding(
        'privacy',
        'warn',
        'phone number; confirm consent or remove',
        m[0]
      )
    );
  return out;
}

/**
 * Run every deterministic gate for one rendered artifact.
 * @param {{ rendered: { type: string, ref: string, text: string, images: Array<{label: string, path: string}> }, kind: string, register?: string, ledger?: any, screenshots?: boolean, evaluate?: Function }} input
 */
export async function runGates({
  rendered,
  kind,
  register,
  ledger,
  screenshots = true,
  evaluate,
}) {
  const spec = KINDS[kind];
  if (!spec)
    throw new Error(
      `unknown --kind ${kind}; one of ${Object.keys(KINDS).join(', ')}`
    );
  const html =
    rendered.type === 'html' ? readFileSync(rendered.ref, 'utf8') : null;
  const groups = {
    copy: copyGate(rendered.text, register ?? spec.register),
    slop:
      rendered.type === 'url'
        ? []
        : slopGate(rendered.ref === 'inline' ? null : rendered.ref),
    design: [
      ...(html ? designTokenGate(html) : []),
      ...(spec.visual && screenshots
        ? await designScreenshotGate(rendered.images, { kind, evaluate })
        : []),
    ],
    claims: claimsGate(
      rendered.text,
      ledger === undefined ? await loadLedger() : ledger,
      spec
    ),
    privacy: privacyGate(rendered.text),
  };
  return Object.entries(groups).map(([id, findings]) => ({
    id,
    status: gateStatus(findings),
    findings,
  }));
}
