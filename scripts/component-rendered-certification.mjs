#!/usr/bin/env node
/**
 * Source-blind rendered component certification (JOV-5400 / JOV-5438).
 *
 * Extends the component-ship gate. Evaluates rendered samples only — never
 * component source — against an explicit applicable-invariant contract.
 * Unknown, missing, or skipped applicable invariants fail closed.
 * JOV-5438 composes the Shadcn/Typeset outcome inventory into the same receipt.
 *
 * Usage:
 *   node scripts/component-rendered-certification.mjs
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runOutcomeCertification } from './component-shadcn-outcome-inventory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

export const RENDERED_CERT_SCHEMA = 'jovie.component-rendered-certification/v1';

export const APPLICABLE_INVARIANTS = Object.freeze([
  'design',
  'copy',
  'accessibility',
  'interaction',
  'layout-stability',
  'theme',
  'semantic-variant',
  'tokenized-padding',
  'concentric-radius',
]);

const INVARIANT_SET = new Set(APPLICABLE_INVARIANTS);
const COLOR_NAME_VARIANT =
  /^(blue|green|purple|orange|red|gray|grey|yellow|pink|cyan)$/i;
const SEMANTIC_TONES = new Set([
  'neutral',
  'info',
  'success',
  'accent',
  'warning',
  'error',
  'destructive',
]);
const PLACEHOLDER_COPY = /^(lorem|ipsum|placeholder|todo|tbd|n\/a)$/i;
const CLASS_LIKE_COPY = /^(bg-|text-|px-|py-|rounded-)/i;
const TOKEN_REF =
  /^(--[a-z0-9-]+|var\(--[a-z0-9-]+\)|bg-surface-\d|bg-btn-|text-(?:primary|secondary|tertiary|quaternary|error|success|warning|info|accent)(?:-token)?|text-btn-|border-subtle|rounded-full|rounded-\(--(?:radius|system-b-radius))/i;
const SPACE_TOKEN =
  /^(--space-[\w.-]+|p[xytblr]?-\d+(?:\.\d+)?|px-2\.5|py-0\.5)$/;
const RADIUS_TOKEN =
  /^(--radius-[\w]+|--system-b-radius-[\w-]+|rounded-(?:none|xs|sm|md|lg|xl|2xl|3xl|full|pill)|rounded-\(--(?:radius|system-b-radius)[\w-]*\))$/;
const ARBITRARY_UTIL = /\[[^\]]+\]/;
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'tab',
  'switch',
  'checkbox',
  'radio',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finding(invariant, detail) {
  return { invariant, detail };
}

function luminanceOf(paint) {
  return paint && typeof paint.luminance === 'string' ? paint.luminance : null;
}

function tokenOf(paint) {
  return paint && typeof paint.token === 'string' && paint.token.trim() !== ''
    ? paint.token
    : null;
}

function isTokenized(value) {
  return typeof value === 'string' && TOKEN_REF.test(value);
}

/**
 * Fail closed unless every invariant is named exactly once as applicable or
 * not-applicable. Evaluation never reads `source` / `tsx` fields.
 * @param {any} sample
 * @returns {{ ok: boolean, findings: { invariant: string, detail: string }[] }}
 */
export function evaluateRenderedSample(sample) {
  const findings = [];
  const add = (invariant, detail) => findings.push(finding(invariant, detail));

  if (!isObject(sample) || typeof sample.id !== 'string' || !sample.id) {
    return {
      ok: false,
      findings: [finding('design', 'sample requires a stable id')],
    };
  }

  const applicable = Array.isArray(sample.applicable) ? sample.applicable : [];
  const notApplicable = Array.isArray(sample.notApplicable)
    ? sample.notApplicable
    : [];
  const named = [];
  for (const id of applicable) {
    if (!INVARIANT_SET.has(id))
      add('design', `unknown applicable invariant: ${id}`);
    named.push(id);
  }
  for (const entry of notApplicable) {
    const id = isObject(entry) ? entry.invariant : entry;
    const reason = isObject(entry) ? entry.reason : '';
    if (!INVARIANT_SET.has(id)) {
      add('design', `unknown not-applicable invariant: ${id}`);
    } else if (typeof reason !== 'string' || reason.trim() === '') {
      add(
        id,
        'not-applicable invariants require an explicit reason; silent skips fail closed'
      );
    }
    named.push(id);
  }
  const namedSet = new Set(named);
  if (namedSet.size !== named.length) {
    add(
      'design',
      'each invariant may be applicable or not-applicable, not both'
    );
  }
  for (const id of APPLICABLE_INVARIANTS) {
    if (!namedSet.has(id)) {
      add(
        id,
        'invariant is neither applicable nor explicitly not-applicable; fail closed'
      );
    }
  }

  const surface = sample.surface;
  if (
    !isObject(surface) ||
    (surface.theme !== 'light' && surface.theme !== 'dark') ||
    (surface.luminance !== 'light' && surface.luminance !== 'dark')
  ) {
    add('theme', 'surface requires theme and luminance of light|dark');
  }
  if (isObject(surface) && surface.theme !== surface.luminance) {
    add(
      'theme',
      `surface theme ${surface.theme} does not match luminance ${surface.luminance}`
    );
  }

  const nodes = Array.isArray(sample.nodes) ? sample.nodes : [];
  if (nodes.length === 0) {
    add('design', 'rendered sample requires at least one node');
  }

  const applicableSet = new Set(applicable);
  const check = id => applicableSet.has(id);

  const owners = new Set();
  const radii = [];
  let interactiveCount = 0;

  for (const [index, node] of nodes.entries()) {
    if (!isObject(node)) {
      add('design', `node ${index} is not an object`);
      continue;
    }
    const label = node.copy || node.accessibleName || `node ${index}`;

    if (typeof node.owner === 'string' && node.owner) owners.add(node.owner);

    if (check('copy')) {
      const copy = typeof node.copy === 'string' ? node.copy.trim() : '';
      if (!copy) add('copy', `${label}: visible copy is empty`);
      else if (PLACEHOLDER_COPY.test(copy) || CLASS_LIKE_COPY.test(copy)) {
        add('copy', `${label}: copy is placeholder or leaked utility class`);
      }
    }

    if (check('design')) {
      const fillToken = tokenOf(node.fill);
      const fgToken = tokenOf(node.foreground);
      if (!fillToken || !isTokenized(fillToken)) {
        add('design', `${label}: fill is not a design token`);
      }
      if (!fgToken || !isTokenized(fgToken)) {
        add('design', `${label}: foreground is not a design token`);
      }
      if (node.fill?.raw && /^#|rgb\(/i.test(node.fill.raw) && !fillToken) {
        add('design', `${label}: raw fill without a token`);
      }
    }

    if (check('theme')) {
      const fillLum = luminanceOf(node.fill);
      const surfaceLum = surface?.luminance;
      if (!fillLum) add('theme', `${label}: fill luminance is missing`);
      else if (surfaceLum && fillLum !== surfaceLum) {
        add('theme', `${label}: ${fillLum} treatment on ${surfaceLum} surface`);
      }
    }

    if (check('semantic-variant')) {
      const variant =
        typeof node.variant === 'string' ? node.variant.trim() : '';
      const tone = typeof node.tone === 'string' ? node.tone.trim() : '';
      if (COLOR_NAME_VARIANT.test(variant)) {
        add(
          'semantic-variant',
          `${label}: arbitrary color-name variant "${variant}" is not a semantic owner axis`
        );
      }
      if (tone && !SEMANTIC_TONES.has(tone)) {
        add('semantic-variant', `${label}: tone "${tone}" is not semantic`);
      }
      if (
        COLOR_NAME_VARIANT.test(variant) &&
        tone &&
        SEMANTIC_TONES.has(tone)
      ) {
        add(
          'semantic-variant',
          `${label}: split variant ownership (${variant} vs ${tone})`
        );
      }
      if (
        node.severity &&
        tone &&
        node.severity !== tone &&
        !(node.severity === 'destructive' && tone === 'error')
      ) {
        add(
          'semantic-variant',
          `${label}: severity ${node.severity} rendered with unrelated tone ${tone}`
        );
      }
    }

    if (check('tokenized-padding')) {
      const padding = node.padding;
      if (!isObject(padding) || !Array.isArray(padding.tokens)) {
        add('tokenized-padding', `${label}: padding tokens are missing`);
      } else {
        if (padding.arbitrary === true) {
          add('tokenized-padding', `${label}: arbitrary padding`);
        }
        for (const token of padding.tokens) {
          if (
            typeof token !== 'string' ||
            ARBITRARY_UTIL.test(token) ||
            !SPACE_TOKEN.test(token)
          ) {
            add(
              'tokenized-padding',
              `${label}: padding ${token} is not a spacing token`
            );
          }
        }
        if (
          Array.isArray(padding.ownerTokens) &&
          padding.ownerTokens.length > 0 &&
          padding.tokens.some(token => !padding.ownerTokens.includes(token))
        ) {
          add(
            'tokenized-padding',
            `${label}: padding tokens diverge from the owning component scale`
          );
        }
      }
    }

    if (check('concentric-radius') && isObject(node.radius)) {
      radii.push({ label, ...node.radius });
      if (node.radius.arbitrary === true) {
        add('concentric-radius', `${label}: arbitrary radius`);
      }
      if (
        node.radius.token &&
        (ARBITRARY_UTIL.test(node.radius.token) ||
          !RADIUS_TOKEN.test(node.radius.token))
      ) {
        add(
          'concentric-radius',
          `${label}: radius ${node.radius.token} is not a radius token`
        );
      }
    }

    const interactive = node.interactive === true;
    if (interactive) interactiveCount += 1;

    if (check('accessibility')) {
      const name =
        typeof node.accessibleName === 'string'
          ? node.accessibleName.trim()
          : '';
      if (interactive && !name) {
        add(
          'accessibility',
          `${label}: interactive control has no accessible name`
        );
      }
      if (interactive && node.role && !INTERACTIVE_ROLES.has(node.role)) {
        add(
          'accessibility',
          `${label}: interactive role "${node.role}" is not an activation role`
        );
      }
    }

    if (check('interaction') && interactive) {
      if (!node.role || !INTERACTIVE_ROLES.has(node.role)) {
        add('interaction', `${label}: interactive node has no activation role`);
      }
    }

    if (check('layout-stability')) {
      const contract = node.layoutContract;
      if (node.pending === true && contract !== 'reserved-geometry') {
        add(
          'layout-stability',
          `${label}: pending state must reserve geometry`
        );
      }
      if (
        contract &&
        contract !== 'static' &&
        contract !== 'reserved-geometry' &&
        contract !== 'bounded-local-disclosure'
      ) {
        add(
          'layout-stability',
          `${label}: unknown layout contract ${contract}`
        );
      }
    }
  }

  if (check('semantic-variant') && owners.size > 1) {
    add(
      'semantic-variant',
      `split owner on one rendered example: ${[...owners].sort().join(', ')}`
    );
  }

  if (check('interaction') && interactiveCount === 0) {
    add(
      'interaction',
      'interaction is applicable but no interactive node was rendered'
    );
  }

  if (check('concentric-radius')) {
    const outer = radii.find(item => item.role === 'outer');
    const inner = radii.find(item => item.role === 'inner');
    if (!outer || !inner) {
      add(
        'concentric-radius',
        'applicable concentric-radius requires outer and inner rendered radii'
      );
    } else {
      const inset =
        typeof inner.insetPx === 'number'
          ? inner.insetPx
          : typeof outer.insetPx === 'number'
            ? outer.insetPx
            : null;
      if (
        typeof outer.px !== 'number' ||
        typeof inner.px !== 'number' ||
        typeof inset !== 'number'
      ) {
        add(
          'concentric-radius',
          'outer, inner, and inset pixel values are required'
        );
      } else if (outer.px !== inner.px + inset) {
        add(
          'concentric-radius',
          `outer ${outer.px}px !== inner ${inner.px}px + inset ${inset}px`
        );
      }
    }
  }

  if (check('layout-stability') && nodes.every(node => !isObject(node))) {
    add('layout-stability', 'no rendered nodes to certify layout stability');
  }
  if (
    check('layout-stability') &&
    nodes.some(isObject) &&
    nodes.every(node => !node?.layoutContract && node?.pending !== true)
  ) {
    add(
      'layout-stability',
      'layout-stability is applicable but no layout contract was rendered'
    );
  }

  return { ok: findings.length === 0, findings };
}

function contract(applicable, reasons) {
  const applicableSet = new Set(applicable);
  return {
    applicable,
    notApplicable: APPLICABLE_INVARIANTS.filter(
      id => !applicableSet.has(id)
    ).map(id => ({
      invariant: id,
      reason: reasons[id] ?? 'not applicable to this example',
    })),
  };
}

const DARK = { theme: 'dark', luminance: 'dark' };
const STATIC = {
  interaction: 'static example; no activation control',
  'layout-stability': 'static example; no pending or disclosure geometry',
  'concentric-radius': 'single-radius pill; no nested surface',
};
const BADGE_PAD = {
  tokens: ['px-2', 'py-0.5'],
  ownerTokens: ['px-2', 'py-0.5'],
};
const paint = (token, luminance) => ({ token, luminance });
const textNode = (copy, extra = {}) => ({
  copy,
  accessibleName: extra.accessibleName ?? copy,
  ...extra,
});
const sample = (id, kind, owner, applicable, reasons, nodes) =>
  Object.freeze({
    id,
    kind,
    owner,
    surface: DARK,
    ...contract(applicable, reasons),
    nodes,
  });

const BADGE_AXES = [
  'design',
  'copy',
  'accessibility',
  'theme',
  'semantic-variant',
  'tokenized-padding',
];
// biome-ignore format: compact rendered-cert fixtures
export const DELIBERATE_RED_FIXTURES = Object.freeze([
  sample('deliberate-red.status-badge.theme-mismatch', 'deliberate-red', 'atom.badge',
    ['design', 'copy', 'accessibility', 'theme', 'semantic-variant'],
    { ...STATIC, 'tokenized-padding': 'theme fixture' },
    [textNode('Active', { owner: 'atom.badge', variant: 'default', fill: paint('--color-bg-primary', 'light'), foreground: paint('--linear-text-primary', 'dark') })]),
  sample('deliberate-red.status-badge.split-owner-arbitrary-variant', 'deliberate-red', 'atom.badge',
    ['design', 'copy', 'accessibility', 'semantic-variant'],
    { ...STATIC, theme: 'ownership fixture', 'tokenized-padding': 'ownership fixture' },
    [
      textNode('Failed', { owner: 'atom.status-badge', variant: 'red', tone: 'success', severity: 'error', fill: paint('--color-success-subtle', 'dark'), foreground: paint('text-success', 'light') }),
      textNode('Failed', { owner: 'atom.badge', variant: 'success', tone: 'success', fill: paint('--color-success-subtle', 'dark'), foreground: paint('text-success', 'light') }),
    ]),
  sample('deliberate-red.status-badge.padding-radius-mismatch', 'deliberate-red', 'atom.badge',
    ['design', 'copy', 'accessibility', 'tokenized-padding', 'concentric-radius'],
    { ...STATIC, theme: 'geometry fixture', 'semantic-variant': 'geometry fixture' },
    [
      textNode('Queued', { owner: 'atom.badge', fill: paint('bg-surface-1', 'dark'), foreground: paint('text-tertiary-token', 'light'), padding: { tokens: ['px-[17px]', 'py-[9px]'], ownerTokens: ['px-2', 'py-0.5'], arbitrary: true }, radius: { token: 'rounded-[7px]', px: 16, role: 'outer', arbitrary: true } }),
      textNode('Queued', { owner: 'atom.badge', fill: paint('bg-surface-1', 'dark'), foreground: paint('text-tertiary-token', 'light'), padding: { tokens: ['px-2', 'py-0.5'] }, radius: { token: 'rounded-[7px]', px: 16, role: 'inner', insetPx: 4, arbitrary: true } }),
    ]),
]);
// biome-ignore format: compact rendered-cert fixtures
export const LANDING_BATCH_SAMPLES = Object.freeze([
  sample('landing-batch.atom.badge.default', 'landing-batch', 'atom.badge', BADGE_AXES, STATIC, [
    textNode('Beta', { owner: 'atom.badge', variant: 'default', fill: paint('--color-bg-primary', 'dark'), foreground: paint('--linear-text-primary', 'light'), padding: BADGE_PAD, radius: { token: 'rounded-full', px: 9999 } }),
  ]),
  sample('landing-batch.atom.badge.tone-success', 'landing-batch', 'atom.badge', BADGE_AXES, STATIC, [
    textNode('success', { owner: 'atom.badge', tone: 'success', fill: paint('bg-surface-1', 'dark'), foreground: paint('text-success', 'light'), padding: BADGE_PAD, radius: { token: 'rounded-full', px: 9999 } }),
  ]),
  sample('landing-batch.atom.button.primary', 'landing-batch', 'atom.button',
    ['design', 'copy', 'accessibility', 'interaction', 'layout-stability', 'theme', 'semantic-variant', 'tokenized-padding'],
    { 'concentric-radius': STATIC['concentric-radius'] },
    [textNode('Primary Button', { owner: 'atom.button', variant: 'primary', interactive: true, role: 'button', layoutContract: 'static', fill: paint('bg-btn-primary', 'dark'), foreground: paint('text-btn-primary-foreground', 'light'), padding: { tokens: ['px-3'], ownerTokens: ['px-3'] }, radius: { token: 'rounded-full', px: 9999 } })]),
  sample('landing-batch.atom.card.default', 'landing-batch', 'atom.card',
    ['design', 'copy', 'accessibility', 'layout-stability', 'theme', 'semantic-variant', 'tokenized-padding', 'concentric-radius'],
    { interaction: STATIC.interaction },
    [
      textNode('Card Title', { owner: 'atom.card', variant: 'default', layoutContract: 'static', fill: paint('bg-surface-1', 'dark'), foreground: paint('text-primary-token', 'light'), padding: { tokens: ['p-6'], ownerTokens: ['p-6'] }, radius: { token: 'rounded-(--system-b-radius-card)', px: 16, role: 'outer', insetPx: 4 } }),
      textNode('This is the main content of the card.', { owner: 'atom.card', layoutContract: 'static', fill: paint('bg-surface-1', 'dark'), foreground: paint('text-primary-token', 'light'), padding: { tokens: ['p-6'], ownerTokens: ['p-6'] }, radius: { token: 'rounded-(--system-b-radius-card-inner)', px: 12, role: 'inner', insetPx: 4 } }),
    ]),
]);

function resolveHeadSha(explicit) {
  if (typeof explicit === 'string' && /^[0-9a-f]{7,40}$/i.test(explicit)) {
    return explicit.toLowerCase();
  }
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const sha = result.stdout?.trim() ?? '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `rendered certification failed closed: exact HEAD SHA is unreadable (${result.stderr?.trim() || sha || 'empty'})`
    );
  }
  return sha.toLowerCase();
}

function receiptFor(sample, evaluation) {
  const verdict = evaluation.ok ? 'pass' : 'block';
  return {
    id: sample.id,
    kind: sample.kind,
    owner: sample.owner ?? null,
    verdict,
    findings: evaluation.findings,
  };
}

/**
 * @param {{ headSha?: string, redFixtures?: any[], landingBatch?: any[], repoRoot?: string, inventory?: object, outcomeRedFixtures?: object[], outcomeBatch?: object[] }} [options]
 */
export function runRenderedCertification(options = {}) {
  const headSha = resolveHeadSha(options.headSha);
  const redFixtures = options.redFixtures ?? DELIBERATE_RED_FIXTURES;
  const landingBatch = options.landingBatch ?? LANDING_BATCH_SAMPLES;
  const issues = [];

  if (!Array.isArray(redFixtures) || redFixtures.length === 0) {
    issues.push('deliberate-red fixtures are missing; fail closed');
  }
  if (!Array.isArray(landingBatch) || landingBatch.length === 0) {
    issues.push('landing-batch samples are missing; fail closed');
  }

  const fixtureReceipts = (redFixtures ?? []).map(sample => {
    const evaluation = evaluateRenderedSample(sample);
    const receipt = receiptFor(sample, evaluation);
    if (receipt.verdict !== 'block') {
      issues.push(`${sample.id}: deliberate-red fixture must block`);
    }
    return receipt;
  });

  const landingReceipts = (landingBatch ?? []).map(sample => {
    const evaluation = evaluateRenderedSample(sample);
    const receipt = receiptFor(sample, evaluation);
    if (receipt.verdict !== 'pass') {
      issues.push(
        `${sample.id}: landing-batch blocked (${evaluation.findings.map(item => item.detail).join('; ')})`
      );
    }
    return receipt;
  });

  const outcome = runOutcomeCertification({
    headSha,
    repoRoot: options.repoRoot,
    inventory: options.inventory,
    redFixtures: options.outcomeRedFixtures,
    enrolledBatch: options.outcomeBatch,
  });
  if (!outcome.ok) {
    issues.push(...outcome.receipt.issues);
  }

  const ok = issues.length === 0;
  return {
    ok,
    schema: RENDERED_CERT_SCHEMA,
    receipt: {
      schema: RENDERED_CERT_SCHEMA,
      gate: 'component-ship-gate',
      section: 'renderedCertification',
      headSha,
      ok,
      issues,
      fixtures: fixtureReceipts,
      landingBatch: landingReceipts,
      shadcnOutcome: outcome.receipt,
    },
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runRenderedCertification();
  if (!result.ok) {
    for (const issue of result.receipt.issues) console.error(issue);
    process.exit(1);
  }
}
