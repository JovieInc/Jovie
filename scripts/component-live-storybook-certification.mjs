#!/usr/bin/env node
/**
 * Live Storybook component certification (JOV-5454).
 *
 * Source-to-render proof: exact canonical story ids/paths, then computed
 * browser evidence at desktop and compact viewports. Fail closed. Extends
 * component-ship-gate rather than a parallel advisory path.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWorkDir,
  LIVE_CERT_TIMEOUT_MS,
  removeWorkDir,
} from './component-live-storybook-lifecycle.mjs';
import { oklchToRgb, parseOklch, relativeLuminance } from './lib/oklch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

export const LIVE_CERT_SCHEMA =
  'jovie.component-live-storybook-certification/v1';
export const LIVE_CERT_CLAIM_BOUNDARY =
  'enrolled-canonical-primitive-stories-only';

export const LIVE_INVARIANTS = Object.freeze([
  'story-contract',
  'theme',
  'semantic-variant',
  'tokenized-padding',
  'tokenized-radius',
  'geometry',
  'concentric-radius',
  'aa-contrast',
  'axe',
  'overflow',
  'zoom',
  'keyboard',
  'hover-stability',
  'copy',
]);

export const LIVE_VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1280, height: 800 }),
  Object.freeze({ id: 'compact', width: 390, height: 844 }),
]);

export const CANONICAL_LIVE_STORIES = Object.freeze([
  Object.freeze({
    id: 'ui-atoms-badge--default',
    exportName: 'Default',
    title: 'UI/Atoms/Badge',
    importPath: 'packages/ui/atoms/badge.stories.tsx',
    owner: 'atom.badge',
  }),
  Object.freeze({
    id: 'ui-atoms-badge--tones',
    exportName: 'Tones',
    title: 'UI/Atoms/Badge',
    importPath: 'packages/ui/atoms/badge.stories.tsx',
    owner: 'atom.badge',
  }),
  Object.freeze({
    id: 'shadcn-button--primary',
    exportName: 'Primary',
    title: 'shadcn/Button',
    importPath: 'packages/ui/atoms/button.stories.tsx',
    owner: 'atom.button',
  }),
  Object.freeze({
    id: 'ui-atoms-card--default',
    exportName: 'Default',
    title: 'UI/Atoms/Card',
    importPath: 'packages/ui/atoms/Card.stories.tsx',
    owner: 'atom.card',
  }),
  Object.freeze({
    id: 'ui-atoms-card--hoverable',
    exportName: 'Hoverable',
    title: 'UI/Atoms/Card',
    importPath: 'packages/ui/atoms/Card.stories.tsx',
    owner: 'atom.card',
  }),
  Object.freeze({
    id: 'ui-atoms-skeleton--certification-matrix',
    exportName: 'CertificationMatrix',
    title: 'UI/Atoms/Skeleton',
    importPath: 'packages/ui/atoms/skeleton.stories.tsx',
    owner: 'atom.skeleton',
  }),
  Object.freeze({
    id: 'ui-atoms-skeleton--loading-certification-matrix',
    exportName: 'LoadingCertificationMatrix',
    title: 'UI/Atoms/Skeleton',
    importPath: 'packages/ui/atoms/skeleton.stories.tsx',
    owner: 'molecule.loading-skeleton',
  }),
]);

const INVARIANT_SET = new Set(LIVE_INVARIANTS);
const SEMANTIC_TONES = new Set([
  'neutral',
  'info',
  'success',
  'accent',
  'warning',
  'error',
  'destructive',
]);
const COLOR_NAME_VARIANT =
  /^(blue|green|purple|orange|red|gray|grey|yellow|pink|cyan)$/i;
const PLACEHOLDER_COPY = /^(lorem|ipsum|placeholder|todo|tbd|n\/a)$/i;
const PLACEHOLDER_PHRASE = /lorem ipsum|john doe|jane doe/i;
const CLASS_LIKE_COPY = /^(bg-|text-|px-|py-|rounded-)/i;
const CHECKMARK_OR_EMOJI = /[✓✔✗✘✅❌☑]|[\u{1F300}-\u{1FAFF}]/u;
const SPACE_TOKEN =
  /^(--space-[\w.-]+|p[xytblr]?-\d+(?:\.\d+)?|px-2\.5|py-0\.5)$/;
const RADIUS_TOKEN =
  /^(--radius-[\w]+|--system-b-radius-[\w-]+|rounded-(?:none|xs|sm|md|lg|xl|2xl|3xl|full|pill)|rounded-\(--(?:radius|system-b-radius)[\w-]*\))$/;
const ARBITRARY_UTIL = /\[[^\]]+\]/;
const AA_TEXT_MIN = 4.5;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finding(invariant, detail) {
  return { invariant, detail };
}

export function storyNameFromExport(exportName) {
  const key = String(exportName || '');
  const startIndex =
    key === key.toUpperCase() ? 0 : Math.max(0, key.search(/[A-Z]/));
  return key
    .slice(startIndex)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
}

export function sanitizeStoryIdPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[ ’–—]/g, '-')
    .replace(/[^\w-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function storyIdFromTitleAndExport(title, exportName) {
  return `${sanitizeStoryIdPart(title)}--${sanitizeStoryIdPart(storyNameFromExport(exportName))}`;
}

export function qualifyNode22(version = process.versions.node) {
  if (!/^22\./.test(String(version || ''))) {
    return {
      ok: false,
      detail: `live Storybook certification requires Node 22.x, found ${version || 'unknown'}`,
    };
  }
  return { ok: true };
}

function normalizeRepoPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/');
}

export function validateCanonicalStoryInventory(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const stories = options.stories ?? CANONICAL_LIVE_STORIES;
  const issues = [];
  if (!Array.isArray(stories) || stories.length !== 7) {
    issues.push(
      `canonical live inventory must declare exactly 7 seeded primitive stories; found ${Array.isArray(stories) ? stories.length : 0}`
    );
  }
  const ids = new Set();
  for (const story of stories ?? []) {
    if (!isObject(story)) {
      issues.push('canonical story entry is missing');
      continue;
    }
    const importPath = normalizeRepoPath(story.importPath);
    if (
      !importPath.startsWith('packages/ui/atoms/') ||
      importPath.includes('..')
    ) {
      issues.push(
        `${story.id ?? importPath}: canonical import path must be packages/ui/atoms/*`
      );
    }
    const abs = resolve(repoRoot, importPath);
    if (!existsSync(abs)) {
      issues.push(`${story.id ?? importPath}: canonical story file is missing`);
      continue;
    }
    const source = readFileSync(abs, 'utf8');
    if (
      !source.includes(`title: '${story.title}'`) &&
      !source.includes(`title: "${story.title}"`)
    ) {
      issues.push(
        `${story.id}: story title ${story.title} is not declared in ${importPath}`
      );
    }
    if (!new RegExp(`export const ${story.exportName}\\b`).test(source)) {
      issues.push(
        `${story.id}: export ${story.exportName} is not declared in ${importPath}`
      );
    }
    const computed = storyIdFromTitleAndExport(story.title, story.exportName);
    if (computed !== story.id) {
      issues.push(
        `${story.id}: computed story id is ${computed}; inventory id must match exactly`
      );
    }
    if (ids.has(story.id))
      issues.push(`${story.id}: duplicate canonical story id`);
    ids.add(story.id);
  }
  return { ok: issues.length === 0, issues, stories };
}

function namedInvariants(sample) {
  const findings = [];
  const applicable = Array.isArray(sample.applicable) ? sample.applicable : [];
  const notApplicable = Array.isArray(sample.notApplicable)
    ? sample.notApplicable
    : [];
  const named = [];
  for (const id of applicable) {
    if (!INVARIANT_SET.has(id))
      findings.push(
        finding('story-contract', `unknown applicable invariant: ${id}`)
      );
    named.push(id);
  }
  for (const entry of notApplicable) {
    const id = isObject(entry) ? entry.invariant : entry;
    const reason = isObject(entry) ? entry.reason : '';
    if (!INVARIANT_SET.has(id)) {
      findings.push(
        finding('story-contract', `unknown not-applicable invariant: ${id}`)
      );
    } else if (typeof reason !== 'string' || reason.trim() === '') {
      findings.push(
        finding(
          id,
          'not-applicable invariants require an explicit reason; silent skips fail closed'
        )
      );
    }
    named.push(id);
  }
  const namedSet = new Set(named);
  if (namedSet.size !== named.length) {
    findings.push(
      finding(
        'story-contract',
        'each invariant may be applicable or not-applicable, not both'
      )
    );
  }
  for (const id of LIVE_INVARIANTS) {
    if (!namedSet.has(id)) {
      findings.push(
        finding(
          id,
          'invariant is neither applicable nor explicitly not-applicable; fail closed'
        )
      );
    }
  }
  return { findings, applicable: new Set(applicable) };
}

function contrastFromPaints(fill, foreground) {
  const toRgb = paint => {
    if (
      isObject(paint?.rgb) &&
      [paint.rgb.r, paint.rgb.g, paint.rgb.b].every(Number.isFinite)
    ) {
      const { r, g, b } = paint.rgb;
      return r > 1 || g > 1 || b > 1
        ? { r: r / 255, g: g / 255, b: b / 255 }
        : paint.rgb;
    }
    if (typeof paint?.raw === 'string' && paint.raw.startsWith('oklch(')) {
      try {
        return oklchToRgb(parseOklch(paint.raw));
      } catch {
        return null;
      }
    }
    const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(
      paint?.raw ?? ''
    );
    if (rgb) {
      return {
        r: Number(rgb[1]) / 255,
        g: Number(rgb[2]) / 255,
        b: Number(rgb[3]) / 255,
      };
    }
    return null;
  };
  const a = toRgb(fill);
  const b = toRgb(foreground);
  if (!a || !b) return null;
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Evaluate one computed browser observation. Never reads component source.
 * @param {any} sample
 */
export function evaluateLiveObservation(sample) {
  const findings = [];
  const add = (invariant, detail) => findings.push(finding(invariant, detail));
  if (!isObject(sample) || typeof sample.id !== 'string' || !sample.id) {
    return {
      ok: false,
      findings: [finding('story-contract', 'observation requires a stable id')],
    };
  }

  const { findings: contractFindings, applicable } = namedInvariants(sample);
  findings.push(...contractFindings);
  const check = id => applicable.has(id);
  const inventory = CANONICAL_LIVE_STORIES.find(
    item => item.id === sample.storyId
  );

  if (check('story-contract')) {
    if (!inventory) {
      add(
        'story-contract',
        `${sample.storyId ?? sample.id}: story id is not in the canonical inventory`
      );
    } else {
      if (sample.importPath !== inventory.importPath) {
        add(
          'story-contract',
          `${sample.storyId}: import path ${sample.importPath} !== ${inventory.importPath}`
        );
      }
      if (sample.owner && sample.owner !== inventory.owner) {
        add(
          'story-contract',
          `${sample.storyId}: owner ${sample.owner} !== ${inventory.owner}`
        );
      }
    }
    if (sample.viewport !== 'desktop' && sample.viewport !== 'compact') {
      add('story-contract', `${sample.id}: viewport must be desktop|compact`);
    }
  }

  const surface = sample.surface;
  if (check('theme')) {
    if (
      !isObject(surface) ||
      (surface.theme !== 'light' && surface.theme !== 'dark') ||
      (surface.luminance !== 'light' && surface.luminance !== 'dark')
    ) {
      add('theme', 'surface requires theme and luminance of light|dark');
    } else if (surface.theme !== surface.luminance) {
      add(
        'theme',
        `surface theme ${surface.theme} does not match luminance ${surface.luminance}`
      );
    }
    const fillLum = sample.fill?.luminance;
    if (fillLum && surface?.luminance && fillLum !== surface.luminance) {
      add('theme', `${fillLum} treatment on ${surface.luminance} surface`);
    }
  }

  if (check('semantic-variant')) {
    const variant =
      typeof sample.variant === 'string' ? sample.variant.trim() : '';
    const tone = typeof sample.tone === 'string' ? sample.tone.trim() : '';
    if (COLOR_NAME_VARIANT.test(variant)) {
      add(
        'semantic-variant',
        `arbitrary color-name variant "${variant}" is not a semantic owner axis`
      );
    }
    if (tone && !SEMANTIC_TONES.has(tone)) {
      add('semantic-variant', `tone "${tone}" is not semantic`);
    }
  }

  const className = typeof sample.classes === 'string' ? sample.classes : '';
  if (check('tokenized-padding')) {
    const padding = sample.padding;
    const tokens =
      isObject(padding) && Array.isArray(padding.tokens) ? padding.tokens : [];
    if (tokens.length === 0) {
      add('tokenized-padding', 'padding tokens are missing');
    } else {
      if (padding.arbitrary === true)
        add('tokenized-padding', 'arbitrary padding');
      for (const token of tokens) {
        if (
          typeof token !== 'string' ||
          ARBITRARY_UTIL.test(token) ||
          !SPACE_TOKEN.test(token)
        ) {
          add('tokenized-padding', `padding ${token} is not a spacing token`);
        }
      }
    }
    if (ARBITRARY_UTIL.test(className) && /p[xytblr]?-\[/.test(className)) {
      add('tokenized-padding', 'class list contains arbitrary padding');
    }
  }

  if (check('tokenized-radius')) {
    const radius = sample.radius;
    const token = isObject(radius) ? radius.token : null;
    if (typeof token !== 'string' || token.trim() === '') {
      add('tokenized-radius', 'radius token is missing');
    } else if (
      radius.arbitrary === true ||
      ARBITRARY_UTIL.test(token) ||
      !RADIUS_TOKEN.test(token)
    ) {
      add('tokenized-radius', `radius ${token} is not a radius token`);
    }
  }

  if (check('geometry')) {
    if (sample.geometry?.matchesOwner !== true) {
      add('geometry', 'rendered anatomy drifted from the owning primitive');
    }
  }

  if (check('concentric-radius')) {
    const radius = sample.radius;
    const outer = typeof radius?.px === 'number' ? radius.px : null;
    const inner = typeof radius?.innerPx === 'number' ? radius.innerPx : null;
    const inset = typeof radius?.insetPx === 'number' ? radius.insetPx : null;
    if (outer === null || inner === null || inset === null) {
      add(
        'concentric-radius',
        'outer, inner, and inset pixel values are required'
      );
    } else if (Math.abs(outer - (inner + inset)) > 0.5) {
      add(
        'concentric-radius',
        `outer ${outer}px !== inner ${inner}px + inset ${inset}px`
      );
    }
  }

  if (check('aa-contrast')) {
    const ratio =
      typeof sample.contrastRatio === 'number'
        ? sample.contrastRatio
        : contrastFromPaints(sample.fill, sample.foreground);
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
      add('aa-contrast', 'contrast ratio is missing; fail closed');
    } else if (ratio < AA_TEXT_MIN) {
      add(
        'aa-contrast',
        `contrast ${ratio.toFixed(2)}:1 is below WCAG AA ${AA_TEXT_MIN}:1`
      );
    }
  }

  if (check('axe')) {
    const violations = Array.isArray(sample.axeViolations)
      ? sample.axeViolations
      : null;
    if (violations === null) add('axe', 'axe results are missing; fail closed');
    else if (violations.length > 0) {
      add(
        'axe',
        `axe violations: ${violations.map(item => item?.id ?? item).join(', ')}`
      );
    }
  }

  if (check('overflow')) {
    if (sample.overflow?.x === true || sample.overflow?.y === true) {
      add('overflow', 'content overflows the story frame');
    } else if (!isObject(sample.overflow)) {
      add('overflow', 'overflow evidence is missing; fail closed');
    }
  }

  if (check('zoom')) {
    if (sample.zoomOverflow?.x === true || sample.zoomOverflow?.y === true) {
      add('zoom', 'content overflows at 200% zoom');
    } else if (!isObject(sample.zoomOverflow)) {
      add('zoom', '200% zoom evidence is missing; fail closed');
    }
  }

  if (check('keyboard')) {
    if (sample.keyboardReached !== true) {
      add('keyboard', 'interactive control was not reached by keyboard');
    }
  }

  if (check('hover-stability')) {
    const shift = sample.hoverShiftPx;
    if (
      !isObject(shift) ||
      ![shift.width, shift.height].every(Number.isFinite)
    ) {
      add('hover-stability', 'hover geometry evidence is missing; fail closed');
    } else if (Math.abs(shift.width) > 0.5 || Math.abs(shift.height) > 0.5) {
      add(
        'hover-stability',
        `hover shifted layout by ${shift.width}×${shift.height}px`
      );
    }
  }

  if (check('copy')) {
    const copy = typeof sample.copy === 'string' ? sample.copy.trim() : '';
    if (!copy) add('copy', 'visible copy is empty');
    else if (
      PLACEHOLDER_COPY.test(copy) ||
      PLACEHOLDER_PHRASE.test(copy) ||
      CLASS_LIKE_COPY.test(copy)
    ) {
      add('copy', 'copy is placeholder or leaked utility class');
    }
    if (CHECKMARK_OR_EMOJI.test(copy)) {
      add('copy', 'copy contains emoji or checkmarks');
    }
    if (
      className.split(/\s+/).includes('uppercase') ||
      (copy.length > 4 && copy === copy.toUpperCase() && /[A-Z]/.test(copy))
    ) {
      add('copy', 'decorative caps are not allowed');
    }
  }

  return { ok: findings.length === 0, findings };
}

function contractFor(owner, extraNa = {}) {
  const interactive = owner === 'atom.button';
  const concentric = owner === 'atom.card';
  const hover = owner === 'atom.button' || owner === 'atom.card';
  const applicable = LIVE_INVARIANTS.filter(id => {
    if (Object.hasOwn(extraNa, id)) return false;
    if (id === 'keyboard' && !interactive) return false;
    if (id === 'concentric-radius' && !concentric) return false;
    if (id === 'hover-stability' && !hover) return false;
    return true;
  });
  const reasons = {
    keyboard: 'static primitive; no activation control',
    'concentric-radius': 'single-radius pill; no nested surface',
    'hover-stability': 'static primitive; hover is not a layout contract',
    ...extraNa,
  };
  return {
    applicable,
    notApplicable: LIVE_INVARIANTS.filter(id => !applicable.includes(id)).map(
      id => ({ invariant: id, reason: reasons[id] })
    ),
  };
}

const DARK = { theme: 'dark', luminance: 'dark' };

/**
 * @param {typeof CANONICAL_LIVE_STORIES[number]} story
 * @param {string} viewport
 * @param {Record<string, any>} [extra]
 */
function observation(story, viewport, extra = {}) {
  const { notApplicableReasons, ...rest } = extra;
  const contract = contractFor(story.owner, notApplicableReasons);
  return Object.freeze({
    id: rest.id ?? `${story.id}@${viewport}`,
    storyId: rest.storyId ?? story.id,
    importPath: story.importPath,
    owner: story.owner,
    viewport,
    surface: DARK,
    ...contract,
    geometry: { matchesOwner: true },
    overflow: { x: false, y: false },
    zoomOverflow: { x: false, y: false },
    axeViolations: [],
    hoverShiftPx: { width: 0, height: 0 },
    contrastRatio: 7.2,
    fill: { luminance: 'dark', token: 'bg-surface-1' },
    foreground: { luminance: 'light', token: 'text-primary-token' },
    ...rest,
  });
}

export function seededPassingObservations() {
  const [
    badgeDefault,
    badgeTones,
    buttonPrimary,
    cardDefault,
    cardHoverable,
    skeletonMatrix,
    loadingSkeletonMatrix,
  ] = CANONICAL_LIVE_STORIES;
  const samples = [];
  for (const viewport of LIVE_VIEWPORTS.map(item => item.id)) {
    samples.push(
      observation(badgeDefault, viewport, {
        copy: 'Beta',
        classes:
          'px-2 py-0.5 rounded-(--system-b-radius-pill) bg-(--color-bg-primary)',
        variant: 'default',
        padding: { tokens: ['px-2', 'py-0.5'] },
        radius: { token: 'rounded-(--system-b-radius-pill)', px: 9999 },
      }),
      observation(badgeTones, viewport, {
        copy: 'success',
        classes: 'px-2 py-0.5 rounded-(--system-b-radius-pill) bg-surface-1',
        variant: 'default',
        tone: 'success',
        padding: { tokens: ['px-2', 'py-0.5'] },
        radius: { token: 'rounded-(--system-b-radius-pill)', px: 9999 },
      }),
      observation(buttonPrimary, viewport, {
        copy: 'Primary Button',
        classes: 'px-3 rounded-full bg-btn-primary',
        variant: 'primary',
        interactive: true,
        keyboardReached: true,
        padding: { tokens: ['px-3'] },
        radius: { token: 'rounded-full', px: 9999 },
      }),
      observation(cardDefault, viewport, {
        copy: 'Card Title',
        classes: 'p-6 rounded-(--system-b-radius-card) bg-surface-1',
        variant: 'default',
        padding: { tokens: ['p-6'] },
        radius: {
          token: 'rounded-(--system-b-radius-card)',
          px: 16,
          innerPx: 12,
          insetPx: 4,
        },
      }),
      observation(cardHoverable, viewport, {
        copy: 'Interactive Card',
        classes: 'p-6 rounded-(--system-b-radius-card) bg-surface-1',
        variant: 'hoverable',
        padding: { tokens: ['p-6'] },
        radius: {
          token: 'rounded-(--system-b-radius-card)',
          px: 16,
          innerPx: 12,
          insetPx: 4,
        },
        notApplicableReasons: {
          keyboard:
            'hover treatment only; this story does not expose an activation role',
        },
      }),
      observation(skeletonMatrix, viewport, {
        classes: 'skeleton h-6 w-full rounded-none',
        radius: { token: 'rounded-none', px: 0 },
        notApplicableReasons: {
          'tokenized-padding': 'placeholder has no internal padding',
          'aa-contrast': 'placeholder has no readable foreground',
          copy: 'placeholder has no visible copy',
        },
      }),
      observation(loadingSkeletonMatrix, viewport, {
        classes: 'space-y-2 skeleton h-5 w-full rounded-md',
        radius: { token: 'rounded-md', px: 6 },
        notApplicableReasons: {
          'tokenized-padding': 'owner has no internal padding',
          'aa-contrast': 'status uses an accessible name',
          copy: 'status uses an accessible name',
        },
      })
    );
  }
  return samples;
}

export const DELIBERATE_RED_LIVE_FIXTURES = Object.freeze([
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.missing-story',
    storyId: 'ui-atoms-badge--does-not-exist',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.theme-mismatch',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    fill: { luminance: 'light', token: 'bg-white' },
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.semantic-drift',
    copy: 'Failed',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'red',
    tone: 'success',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.off-token-padding',
    copy: 'Beta',
    classes: 'px-[17px] py-[9px] rounded-full',
    variant: 'default',
    padding: { tokens: ['px-[17px]', 'py-[9px]'], arbitrary: true },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.off-token-radius',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-[7px]',
    variant: 'default',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-[7px]', px: 7, arbitrary: true },
  }),
  observation(CANONICAL_LIVE_STORIES[3], 'desktop', {
    id: 'deliberate-red.live.geometry-drift',
    copy: 'Card Title',
    classes: 'p-6 rounded-(--system-b-radius-card)',
    variant: 'default',
    geometry: { matchesOwner: false },
    padding: { tokens: ['p-6'] },
    radius: {
      token: 'rounded-(--system-b-radius-card)',
      px: 16,
      innerPx: 12,
      insetPx: 4,
    },
  }),
  observation(CANONICAL_LIVE_STORIES[3], 'desktop', {
    id: 'deliberate-red.live.nonconcentric',
    copy: 'Card Title',
    classes: 'p-6 rounded-(--system-b-radius-card)',
    variant: 'default',
    padding: { tokens: ['p-6'] },
    radius: {
      token: 'rounded-(--system-b-radius-card)',
      px: 16,
      innerPx: 8,
      insetPx: 4,
    },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.aa-contrast',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    contrastRatio: 1.2,
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.axe',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    axeViolations: [{ id: 'button-name' }],
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.overflow',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    overflow: { x: true, y: false },
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.zoom',
    copy: 'Beta',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    zoomOverflow: { x: true, y: false },
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[2], 'desktop', {
    id: 'deliberate-red.live.keyboard-gap',
    copy: 'Primary Button',
    classes: 'px-3 rounded-full',
    variant: 'primary',
    keyboardReached: false,
    padding: { tokens: ['px-3'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[4], 'desktop', {
    id: 'deliberate-red.live.hover-shift',
    copy: 'Interactive Card',
    classes: 'p-6 rounded-(--system-b-radius-card)',
    variant: 'hoverable',
    hoverShiftPx: { width: 12, height: 0 },
    padding: { tokens: ['p-6'] },
    radius: {
      token: 'rounded-(--system-b-radius-card)',
      px: 16,
      innerPx: 12,
      insetPx: 4,
    },
    notApplicableReasons: {
      keyboard:
        'hover treatment only; this story does not expose an activation role',
    },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.placeholder-copy',
    copy: 'lorem ipsum',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.emoji-checkmark',
    copy: 'Done ✓',
    classes: 'px-2 py-0.5 rounded-full',
    variant: 'default',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
  observation(CANONICAL_LIVE_STORIES[0], 'desktop', {
    id: 'deliberate-red.live.decorative-caps',
    copy: 'BETA LABEL',
    classes: 'px-2 py-0.5 rounded-full uppercase',
    variant: 'default',
    padding: { tokens: ['px-2', 'py-0.5'] },
    radius: { token: 'rounded-full', px: 9999 },
  }),
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
      `live Storybook certification failed closed: exact HEAD SHA is unreadable (${result.stderr?.trim() || sha || 'empty'})`
    );
  }
  return sha.toLowerCase();
}

function liveVisualCertification(ok, stories) {
  return {
    status: ok ? 'certified' : 'blocked',
    certified: ok ? CANONICAL_LIVE_STORIES.length : 0,
    claimBoundary: LIVE_CERT_CLAIM_BOUNDARY,
    viewports: LIVE_VIEWPORTS.map(item => item.id),
    stories: stories.map(item => item.id),
    requires: ok
      ? []
      : [
          'rendered observations from the exact Jovie Storybook',
          'exact CI receipt',
        ],
  };
}

/**
 * @param {{ headSha?: string, observations?: any[], redFixtures?: any[], repoRoot?: string, skipCollect?: boolean, collect?: boolean, nodeVersion?: string, stories?: any[] }} [options]
 */
export function runLiveStorybookCertification(options = {}) {
  const node = qualifyNode22(options.nodeVersion ?? process.versions.node);
  const issues = [];
  if (!node.ok) issues.push(node.detail);
  const inventory = validateCanonicalStoryInventory({
    repoRoot: options.repoRoot,
    stories: options.stories,
  });
  if (!inventory.ok) issues.push(...inventory.issues);

  const redFixtures = options.redFixtures ?? DELIBERATE_RED_LIVE_FIXTURES;
  const redReceipts = (redFixtures ?? []).map(sample => {
    const evaluation = evaluateLiveObservation(sample);
    if (evaluation.ok) {
      issues.push(`${sample.id}: deliberate-red fixture must block`);
    }
    return {
      id: sample.id,
      verdict: evaluation.ok ? 'pass' : 'block',
      findings: evaluation.findings,
    };
  });
  if (!Array.isArray(redFixtures) || redFixtures.length === 0) {
    issues.push('deliberate-red fixtures are missing; fail closed');
  }

  let observations = options.observations;
  if (!Array.isArray(observations)) {
    if (options.skipCollect) {
      issues.push('live observations are missing; fail closed');
      observations = [];
    } else if (options.collect === true) {
      issues.push(
        'live collect must run through the async collector; fail closed'
      );
      observations = [];
    } else {
      return collectViaSubprocess(options, inventory, issues, redReceipts);
    }
  }

  const expectedPairs = CANONICAL_LIVE_STORIES.flatMap(story =>
    LIVE_VIEWPORTS.map(viewport => `${story.id}@${viewport.id}`)
  );
  const seen = new Set(observations.map(item => item?.id));
  for (const id of expectedPairs) {
    if (!seen.has(id)) {
      issues.push(
        `${id}: seeded primitive observation is missing; fail closed`
      );
    }
  }

  const observationReceipts = observations.map(sample => {
    const evaluation = evaluateLiveObservation(sample);
    if (!evaluation.ok) {
      issues.push(
        `${sample.id}: live observation blocked (${evaluation.findings.map(item => item.detail).join('; ')})`
      );
    }
    return {
      id: sample.id,
      storyId: sample.storyId,
      viewport: sample.viewport,
      verdict: evaluation.ok ? 'pass' : 'block',
      findings: evaluation.findings,
    };
  });

  const ok = issues.length === 0;
  const headSha = resolveHeadSha(options.headSha);
  return {
    ok,
    schema: LIVE_CERT_SCHEMA,
    receipt: {
      schema: LIVE_CERT_SCHEMA,
      gate: 'component-ship-gate',
      section: 'liveStorybookCertification',
      headSha,
      ok,
      issues,
      claimBoundary: LIVE_CERT_CLAIM_BOUNDARY,
      liveVisualCertification: liveVisualCertification(ok, inventory.stories),
      inventory: inventory.stories.map(item => ({
        id: item.id,
        importPath: item.importPath,
      })),
      fixtures: redReceipts,
      observations: observationReceipts,
    },
  };
}

function collectViaSubprocess(options, inventory, priorIssues, redReceipts) {
  const headSha = resolveHeadSha(options.headSha);
  const work = createWorkDir('jovie-live-cert-receipt-');
  const receiptFile = resolve(work, 'receipt.json');
  try {
    const result = spawnSync(
      process.execPath,
      [
        resolve(__dirname, 'component-live-storybook-browser.mjs'),
        '--collect',
        `--head=${headSha}`,
        `--receipt=${receiptFile}`,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: LIVE_CERT_TIMEOUT_MS + 15_000,
        env: {
          ...process.env,
          JOVIE_LIVE_STORYBOOK_CERT: '1',
        },
      }
    );
    if (result.status !== 0 && !existsSync(receiptFile)) {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      return {
        ok: false,
        schema: LIVE_CERT_SCHEMA,
        receipt: {
          schema: LIVE_CERT_SCHEMA,
          gate: 'component-ship-gate',
          section: 'liveStorybookCertification',
          headSha,
          ok: false,
          issues: [
            ...priorIssues,
            `live Storybook collect failed closed (${result.status ?? 'timeout'}): ${output.slice(0, 2000) || 'no output'}`,
          ],
          claimBoundary: LIVE_CERT_CLAIM_BOUNDARY,
          liveVisualCertification: liveVisualCertification(
            false,
            inventory.stories
          ),
          inventory: inventory.stories.map(item => ({
            id: item.id,
            importPath: item.importPath,
          })),
          fixtures: redReceipts,
          observations: [],
        },
      };
    }
    const parsed = JSON.parse(readFileSync(receiptFile, 'utf8'));
    return parsed;
  } finally {
    removeWorkDir(work);
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = runLiveStorybookCertification();
  if (!result.ok) {
    for (const issue of result.receipt.issues) console.error(issue);
    process.exit(1);
  }
}
