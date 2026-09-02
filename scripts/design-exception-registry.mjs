#!/usr/bin/env node
/** Design exception-registry contract (JOV-5447): trusted-base shrink-only. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gitShowText,
  resolveCiFastTrustedBase,
} from './lib/ci-fast-trusted-base.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const CHECK_COMMAND = 'pnpm design:exception-registry:check';
const LINEAR_ISSUE = /^JOV-\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ISSUE_CODES = Object.freeze({
  MISSING_TRUSTED_BASE: 'missing-trusted-base',
  MISSING_REGISTRY: 'missing-registry',
  SELF_SEEDED_REGISTRY: 'self-seeded-registry',
  INVALID_REGISTRY: 'invalid-registry',
  COUNT_GROWTH: 'count-growth',
  SET_GROWTH: 'set-growth',
  PATH_GROWTH: 'path-growth',
  VALUE_GROWTH: 'value-growth',
  MISSING_EXCEPTION_METADATA: 'missing-exception-metadata',
  EXPIRED_EXCEPTION: 'expired-exception',
  EVIDENCE_FREE_EXCEPTION: 'evidence-free-exception',
});
/** @typedef {{ id: string, path: string, kind: 'count'|'count-map'|'set'|'findings'|'exceptions', counts?: string[], pointer?: string[], identityKeys?: string[], growthCode?: string }} RegistrySpec */

/** @type {readonly RegistrySpec[]} */
export const DESIGN_EXCEPTION_REGISTRIES = Object.freeze(
  JSON.parse(`[
{"id":"arbitrary-values","path":"apps/web/tests/unit/design-system/arbitrary-values.baseline.json","kind":"count","counts":["count"]},
{"id":"linear-namespace","path":"apps/web/tests/unit/design-system/linear-namespace.baseline.json","kind":"count","counts":["count"]},
{"id":"raw-button","path":"apps/web/tests/unit/design-system/raw-button.baseline.json","kind":"count","counts":["count"]},
{"id":"server-imports","path":"apps/web/tests/unit/design-system/server-imports.baseline.json","kind":"count","counts":["count"]},
{"id":"sidebar-nav-row","path":"apps/web/tests/unit/design-system/sidebar-nav-row.baseline.json","kind":"count","counts":["count"]},
{"id":"contrast-ratchet","path":"apps/web/contrast-ratchet.baseline.json","kind":"count","counts":["bareTextBlack","bareBgWhite","bareTextWhite","bareBgBlack","arbitraryHex"]},
{"id":"component-family-counts","path":"apps/web/tests/unit/design-system/component-family.baseline.json","kind":"count-map","pointer":["counts"]},
{"id":"component-family-empty-states","path":"apps/web/tests/unit/design-system/component-family.baseline.json","kind":"set","pointer":["allowedEmptyStatePaths"],"growthCode":"path-growth"},
{"id":"button-surface-max","path":"apps/web/tests/unit/design-system/button-surface-classes-remaining.json","kind":"count","counts":["maxRemaining"]},
{"id":"button-surface-remaining","path":"apps/web/tests/unit/design-system/button-surface-classes-remaining.json","kind":"set","pointer":["remaining"],"growthCode":"set-growth"},
{"id":"design-conformance-legacy","path":"docs/design-system/design-conformance-manifest.json","kind":"set","pointer":["legacy","unboundComponentIds"],"growthCode":"set-growth"},
{"id":"shared-ui-visual-arbitrary","path":"scripts/shared-ui-visual-arbitrary.baseline.json","kind":"findings","pointer":["findings"]},
{"id":"design-authority-serif","path":"scripts/design-authority-exceptions.json","kind":"exceptions","pointer":["serif"],"identityKeys":["path","match"]}
]`)
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function issue(code, registry, detail) {
  return { code, registry, detail };
}

function atPointer(record, pointer) {
  if (!pointer || pointer.length === 0) return record;
  let current = record;
  for (const key of pointer) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = current[key];
  }
  return current;
}

function parseJsonText(text, path) {
  try {
    return { missing: false, value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { missing: false, error: `${path}: invalid JSON (${message})` };
  }
}

function readCandidateFile(repoRoot, relativePath) {
  const fullPath = join(repoRoot, relativePath);
  if (!existsSync(fullPath)) return { missing: true };
  return parseJsonText(readFileSync(fullPath, 'utf8'), relativePath);
}

function readBaseFile(repoRoot, ref, relativePath) {
  const text = gitShowText(repoRoot, ref, relativePath);
  if (text === null) return { missing: true };
  return parseJsonText(text, relativePath);
}

function expiryMs(expiresOn) {
  if (!ISO_DATE.test(expiresOn ?? '')) return NaN;
  return Date.parse(`${expiresOn}T23:59:59.999Z`);
}

export function exceptionMetadataIssues(entry, prefix) {
  /** @type {string[]} */
  const issues = [];
  if (typeof entry?.owner !== 'string' || entry.owner.trim() === '') {
    issues.push(`${prefix}: owner is required`);
  }
  if (typeof entry?.reason !== 'string' || entry.reason.trim().length < 10) {
    issues.push(`${prefix}: reason is required`);
  }
  if (!LINEAR_ISSUE.test(entry?.issue ?? '')) {
    issues.push(`${prefix}: Linear issue is required (JOV-NNNN)`);
  }
  const hasRemoval =
    typeof entry?.removalCondition === 'string' &&
    entry.removalCondition.trim() !== '';
  const hasExpiry = ISO_DATE.test(entry?.expiresOn ?? '');
  if (!hasRemoval && !hasExpiry) {
    issues.push(`${prefix}: removal condition or expiry is required`);
  }
  if (typeof entry?.evidence !== 'string' || entry.evidence.trim() === '') {
    issues.push(`${prefix}: evidence is required`);
  }
  return issues;
}

function fail(spec, code, detail) {
  return issue(code, spec.id, `${spec.path}: ${detail}`);
}

function compareCounts(spec, candidateRecord, baseRecord, keys) {
  /** @type {ReturnType<typeof issue>[]} */
  const issues = [];
  for (const key of keys) {
    const candidate = candidateRecord?.[key] ?? 0;
    const base = baseRecord?.[key] ?? 0;
    if (!isCount(candidate) || !isCount(base)) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.INVALID_REGISTRY,
          `${key} must be a finite non-negative number`
        )
      );
      continue;
    }
    if (candidate > base) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.COUNT_GROWTH,
          `${key} grew ${base} → ${candidate} versus trusted base`
        )
      );
    }
  }
  return issues;
}

function compareSet(spec, candidateRecord, baseRecord) {
  const candidateSet = atPointer(candidateRecord, spec.pointer);
  const baseSet = atPointer(baseRecord, spec.pointer);
  if (!Array.isArray(candidateSet) || !Array.isArray(baseSet)) {
    return [
      fail(spec, ISSUE_CODES.INVALID_REGISTRY, 'set values must be arrays'),
    ];
  }
  const baseItems = new Set(baseSet.map(item => String(item)));
  const added = candidateSet
    .map(item => String(item))
    .filter(item => !baseItems.has(item));
  if (added.length === 0) return [];
  return [
    fail(
      spec,
      spec.growthCode ?? ISSUE_CODES.SET_GROWTH,
      `added ${added.length} item(s) versus trusted base: ${added.slice(0, 8).join(', ')}`
    ),
  ];
}

function compareFindings(spec, candidateRecord, baseRecord) {
  const candidateFindings = atPointer(candidateRecord, spec.pointer);
  const baseFindings = atPointer(baseRecord, spec.pointer);
  if (!Array.isArray(candidateFindings) || !Array.isArray(baseFindings)) {
    return [
      fail(spec, ISSUE_CODES.INVALID_REGISTRY, 'findings must be arrays'),
    ];
  }
  /** @type {Map<string, number>} */
  const baseIndex = new Map();
  for (const finding of baseFindings) {
    if (isObject(finding))
      baseIndex.set(`${finding.file}::${finding.value}`, finding.count);
  }
  /** @type {ReturnType<typeof issue>[]} */
  const issues = [];
  for (const finding of candidateFindings) {
    if (
      !isObject(finding) ||
      typeof finding.file !== 'string' ||
      typeof finding.value !== 'string' ||
      !isCount(finding.count)
    ) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.INVALID_REGISTRY,
          'each finding requires file, value, and count'
        )
      );
      continue;
    }
    const key = `${finding.file}::${finding.value}`;
    const baseCount = baseIndex.get(key);
    if (baseCount === undefined) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.VALUE_GROWTH,
          `added value ${finding.file} ${finding.value} versus trusted base`
        )
      );
      continue;
    }
    if (finding.count > baseCount) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.COUNT_GROWTH,
          `${finding.file} ${finding.value} grew ${baseCount} → ${finding.count} versus trusted base`
        )
      );
    }
  }
  return issues;
}

function compareExceptions(spec, candidateRecord, baseRecord, now) {
  const candidateEntries = atPointer(candidateRecord, spec.pointer);
  const baseEntries = atPointer(baseRecord, spec.pointer);
  if (!Array.isArray(candidateEntries) || !Array.isArray(baseEntries)) {
    return [
      fail(
        spec,
        ISSUE_CODES.INVALID_REGISTRY,
        'exception entries must be arrays'
      ),
    ];
  }
  const identityKeys = spec.identityKeys ?? ['path', 'match'];
  const baseIds = new Set(
    baseEntries
      .filter(isObject)
      .map(entry =>
        identityKeys.map(key => String(entry[key] ?? '')).join('::')
      )
  );
  /** @type {ReturnType<typeof issue>[]} */
  const issues = [];
  for (const entry of candidateEntries) {
    if (!isObject(entry)) {
      issues.push(
        fail(
          spec,
          ISSUE_CODES.INVALID_REGISTRY,
          'exception entry must be an object'
        )
      );
      continue;
    }
    const id = identityKeys.map(key => String(entry[key] ?? '')).join('::');
    const prefix = `${spec.path} entry ${id || '<missing>'}`;
    const metadataIssues = exceptionMetadataIssues(entry, prefix);
    if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
      issues.push(
        issue(
          ISSUE_CODES.EVIDENCE_FREE_EXCEPTION,
          spec.id,
          `${prefix}: evidence is required`
        )
      );
    }
    if (!baseIds.has(id) && metadataIssues.length > 0) {
      issues.push(
        issue(
          ISSUE_CODES.MISSING_EXCEPTION_METADATA,
          spec.id,
          metadataIssues.join('; ')
        )
      );
    }
    if (
      ISO_DATE.test(entry.expiresOn ?? '') &&
      expiryMs(entry.expiresOn) < now.getTime()
    ) {
      issues.push(
        issue(
          ISSUE_CODES.EXPIRED_EXCEPTION,
          spec.id,
          `${prefix}: expired on ${entry.expiresOn}`
        )
      );
    }
  }
  return issues;
}

function compareRegistry(spec, candidateRecord, baseRecord, now) {
  switch (spec.kind) {
    case 'count':
      return compareCounts(
        spec,
        candidateRecord,
        baseRecord,
        spec.counts ?? []
      );
    case 'count-map': {
      const left = atPointer(candidateRecord, spec.pointer);
      const right = atPointer(baseRecord, spec.pointer);
      const keys = [
        ...Object.keys(isObject(right) ? right : {}),
        ...Object.keys(isObject(left) ? left : {}),
      ];
      return compareCounts(spec, left, right, [...new Set(keys)]);
    }
    case 'set':
      return compareSet(spec, candidateRecord, baseRecord);
    case 'findings':
      return compareFindings(spec, candidateRecord, baseRecord);
    case 'exceptions':
      return compareExceptions(spec, candidateRecord, baseRecord, now);
    default:
      return [
        fail(spec, ISSUE_CODES.INVALID_REGISTRY, 'unknown registry kind'),
      ];
  }
}

/**
 * @param {{
 *   repoRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   now?: Date,
 *   registries?: readonly RegistrySpec[],
 *   resolveTrustedBase?: typeof resolveCiFastTrustedBase,
 *   readCandidate?: (path: string) => { missing: boolean, value?: unknown, error?: string },
 *   readBase?: (ref: string, path: string) => { missing: boolean, value?: unknown, error?: string },
 * }} [options]
 */
export function evaluateDesignExceptionRegistries(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const registries = options.registries ?? DESIGN_EXCEPTION_REGISTRIES;
  const resolved =
    options.resolveTrustedBase?.({ repoRoot, env }) ??
    resolveCiFastTrustedBase({ repoRoot, env });
  /** @type {ReturnType<typeof issue>[]} */
  const issues = [];

  if (resolved.ok !== true) {
    const detail =
      resolved.ok === false ? resolved.detail : 'trusted base is missing';
    return {
      ok: false,
      trustedBase: null,
      issues: [issue(ISSUE_CODES.MISSING_TRUSTED_BASE, '*', detail)],
    };
  }

  const trustedBase = resolved.ref;
  const readCandidate =
    options.readCandidate ?? (path => readCandidateFile(repoRoot, path));
  const readBase =
    options.readBase ?? ((ref, path) => readBaseFile(repoRoot, ref, path));
  /** @type {Map<string, { missing: boolean, value?: unknown, error?: string }>} */
  const candidateByPath = new Map();
  /** @type {Map<string, { missing: boolean, value?: unknown, error?: string }>} */
  const baseByPath = new Map();
  const missingReported = new Set();

  for (const spec of registries) {
    if (!candidateByPath.has(spec.path))
      candidateByPath.set(spec.path, readCandidate(spec.path));
    if (!baseByPath.has(spec.path))
      baseByPath.set(spec.path, readBase(trustedBase, spec.path));
    const candidate = candidateByPath.get(spec.path);
    const base = baseByPath.get(spec.path);
    if (candidate?.error) {
      issues.push(
        issue(ISSUE_CODES.INVALID_REGISTRY, spec.id, candidate.error)
      );
      continue;
    }
    if (base?.error) {
      issues.push(issue(ISSUE_CODES.INVALID_REGISTRY, spec.id, base.error));
      continue;
    }
    if (candidate?.missing || base?.missing) {
      const key = `${candidate?.missing ? 'c' : ''}${base?.missing ? 'b' : ''}:${spec.path}`;
      if (missingReported.has(key)) continue;
      missingReported.add(key);
      const both = candidate?.missing && base?.missing;
      const selfSeeded = Boolean(base?.missing && !candidate?.missing);
      issues.push(
        issue(
          selfSeeded
            ? ISSUE_CODES.SELF_SEEDED_REGISTRY
            : ISSUE_CODES.MISSING_REGISTRY,
          spec.id,
          both
            ? `required registry ${spec.path} is missing`
            : selfSeeded
              ? `${spec.path} is absent from trusted base ${trustedBase}`
              : `required registry ${spec.path} is missing on the candidate tree`
        )
      );
      continue;
    }
    issues.push(...compareRegistry(spec, candidate.value, base.value, now));
  }

  return { ok: issues.length === 0, trustedBase, issues };
}

export function formatDesignExceptionRegistryResult(result) {
  if (result.ok) {
    return `[design-exception-registry] PASS — ${DESIGN_EXCEPTION_REGISTRIES.length} registries shrink-only versus ${result.trustedBase}`;
  }
  return [
    `[design-exception-registry] FAIL — trusted base ${result.trustedBase ?? '(missing)'}`,
    ...result.issues.map(
      item => `  [${item.code}] ${item.registry}: ${item.detail}`
    ),
  ].join('\n');
}

function main() {
  const repoRoot = process.env.DESIGN_EXCEPTION_REGISTRY_ROOT || REPO_ROOT;
  const result = evaluateDesignExceptionRegistries({ repoRoot });
  const output = formatDesignExceptionRegistryResult(result);
  if (!result.ok) {
    console.error(output);
    process.exitCode = 1;
    return;
  }
  console.log(output);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
