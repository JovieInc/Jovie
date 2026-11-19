#!/usr/bin/env node
// JOV-13132 — launch/core dark-merge check (deterministic, NON-required).
//
// Contract §1.16 (Tim, 2026-11-19): no flags on launch/core work — no
// default-off, percentage or allowlist rollout, no merged-but-dark code.
// This check fails a diff that adds, or a touched file that keeps, a hiding
// toggle over launch/core behavior. It keys off the hiding STRUCTURE
// (env-driven branching, flag-store APIs, rollout and allowlist arithmetic),
// never the word "flag": a toggle counts whatever it is named.
//
// Launch/core is the §1.16 surface list: signup, onboarding, the golden
// path, public profiles, pricing/billing/checkout, the homepage and launch
// surfaces. Only those prefixes are scanned, so flags in non-core internal
// tooling pass.
//
// Exemptions are exact-name only:
//   - Tim-ordered incident kill switches, default ON and rollback-only
//     (PUBLIC_SIGNUP_CLOSED).
//   - CI/tooling envs that are not launch/core (PR_BODY_LINT_MODE,
//     LANES_RELAY_LINEAR).
//
// Non-required by design (JOV-13132): this script reports and exits; the
// workflow hook belongs to Eve Mac/gh. Never weaken or skip an existing
// check to wire it in, and never promote it to required from this file.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBaseRef } from '../lib/git-base-ref.mjs';

/** §1.16 launch/core surfaces (repo-rooted prefixes). */
export const LAUNCH_CORE_PREFIXES = Object.freeze([
  'apps/web/app/(home)/',
  'apps/web/app/(auth)/',
  'apps/web/app/(marketing)/',
  'apps/web/app/(dynamic)/start/',
  'apps/web/app/[username]/',
  'apps/web/app/onboarding/',
  'apps/web/app/billing/',
  'apps/web/app/waitlist/',
  'apps/web/app/claim/',
  'apps/web/app/api/billing/',
  'apps/web/app/api/onboarding/',
  'apps/web/app/api/waitlist/',
  'apps/web/components/homepage/',
  'apps/web/components/marketing/',
  'apps/web/components/site/',
  'apps/web/components/auth/',
  'apps/web/components/onboarding/',
  'apps/web/components/features/onboarding/',
  'apps/web/components/features/profile/',
]);

/**
 * Exact names exempt from the env-toggle and flag-identifier patterns:
 * Tim-ordered incident kill switches (default ON, rollback-only) and
 * CI/tooling switches that are not launch/core behavior.
 */
export const EXEMPT_NAMES = Object.freeze([
  'PUBLIC_SIGNUP_CLOSED',
  'PR_BODY_LINT_MODE',
  'LANES_RELAY_LINEAR',
]);

const EXEMPT = new Set(EXEMPT_NAMES);

/** Shipped code only: no docs, styles, or test/story fixtures. */
const SCANNABLE = /\.(?:[cm]?[jt]sx?)$/;
const NOT_SHIPPED =
  /(?:\.d\.ts$|\.test\.|\.spec\.|\.stories\.|\/__tests__\/|\/__mocks__\/)/;

/** Flag-store and experiment APIs (Statsig/PostHog/LD/GrowthBook-style). */
const FLAG_LIB =
  /\b(?:checkGate|useGateValue|useGate|getExperiment|getFeatureGate|getFeatureFlag|useFeatureGate|useFeatureFlag|isFeatureEnabled|featureEnabled|flagEnabled|isFlagOn|featureFlags?|featureGates?|launchdarkly|growthbook|flagsmith|statsig|openfeature)\b/i;

/** Percentage / bucketed rollout arithmetic. */
const ROLLOUT =
  /(?:Math\.random\(\)|\b(?:rollout(?:Percentage|Percent)?|percent(?:age)?Enabled|percentRollout|abTest(?:ing)?|bucketUser|bucketFor|cohortFor|holdback)\b)/i;

/** Allowlist / whitelist gating of who sees the behavior (any casing). */
const ALLOWLIST =
  /\b\w*[Aa]llow(?:[-_]?[Ll]ist|list)\b|\b\w*[Ww]hite(?:[-_]?[Ll]ist|list)\b/;

/** A runtime environment read. */
const ENV_READ =
  /process\.env(?:\.[A-Z0-9_]+|\[\s*(?:'|")[A-Z0-9_]+(?:'|")\s*\])/;

/** A branch that behaves differently on either side of the read. */
const CONDITIONAL = /\?[^?]*:|&&|\|\||===|!==|\bif\b|\bswitch\b/;

/** UPPER_SNAKE names that announce a gate (ends with the gate word). */
const GATE_NAME =
  /\b[A-Z][A-Z0-9_]*(?:FLAGS?|GATES?|ROLLOUT|ENABLED|ALLOWLIST|WHITELIST|PERCENT|DARK)\b/;

const PATTERN_LABELS = {
  'flag-store-api': 'flag-store API',
  'rollout-percentage': 'percentage/rollout arithmetic',
  'allowlist-gate': 'allowlist gate',
  'env-toggle': 'env-driven toggle',
  'flag-identifier': 'gate identifier',
};

/** process.env names read on a line (bracket and dot forms). */
function envNamesOnLine(text) {
  const names = [];
  for (const m of text.matchAll(
    /process\.env(?:\.([A-Z0-9_]+)|\[\s*(?:'|")([A-Z0-9_]+)(?:'|")\s*\])/g
  ))
    names.push(m[1] || m[2]);
  return names;
}

/** All UPPER_SNAKE gate-name tokens on a line. */
function gateNamesOnLine(text) {
  return [...text.matchAll(new RegExp(GATE_NAME.source, 'g'))].map(m => m[0]);
}

/** One line of shipped launch/core code, or null when it hides nothing. */
export function scanLine(line) {
  const text = line.trim();
  if (!text || /^(?:\/\/|\/\*|\*)/.test(text)) return null;
  const hits = [];
  if (FLAG_LIB.test(text)) hits.push('flag-store-api');
  if (ROLLOUT.test(text)) hits.push('rollout-percentage');
  if (ALLOWLIST.test(text)) hits.push('allowlist-gate');
  if (ENV_READ.test(text) && CONDITIONAL.test(text)) hits.push('env-toggle');
  if (GATE_NAME.test(text)) hits.push('flag-identifier');
  if (!hits.length) return null;
  // Name exemptions only rescue lines whose every signal is a name (env read
  // or gate identifier). Structure signals (flag stores, rollouts,
  // allowlists) are never exempt.
  if (hits.every(h => h === 'env-toggle' || h === 'flag-identifier')) {
    const names = [...envNamesOnLine(text), ...gateNamesOnLine(text)];
    if (names.length && names.every(n => EXEMPT.has(n))) return null;
  }
  return { patterns: hits, matched: PATTERN_LABELS[hits[0]] };
}

export function isLaunchCorePath(file) {
  return LAUNCH_CORE_PREFIXES.some(prefix => file.startsWith(prefix));
}

/** A file whose lines this check scans (launch/core shipped code only). */
export function isScannableFile(file) {
  return (
    isLaunchCorePath(file) && SCANNABLE.test(file) && !NOT_SHIPPED.test(file)
  );
}

/**
 * Scan a unified diff. Returns findings on added lines (class "added") plus,
 * per launch/core file touched, the set of added line numbers so a caller
 * with tree access can report lines kept dark (class "kept").
 */
export function scanDiff(diffText) {
  const findings = [];
  /** @type {Map<string, Set<number>>} */
  const addedLines = new Map();
  let file = null;
  let newLine = 0;
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      file = null;
      newLine = 0;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '');
      file = path === '/dev/null' ? null : path;
      continue;
    }
    if (file === null) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      newLine = Number.parseInt(hunk[1], 10);
      continue;
    }
    if (raw.startsWith('+')) {
      const line = raw.slice(1);
      const hit = isScannableFile(file) ? scanLine(line) : null;
      if (hit)
        findings.push({
          file,
          line: newLine,
          class: 'added',
          ...hit,
          snippet: line.trim().slice(0, 160),
        });
      if (line !== '' && isScannableFile(file)) {
        const set = addedLines.get(file) ?? new Set();
        set.add(newLine);
        addedLines.set(file, set);
      }
      newLine++;
      continue;
    }
    if (!raw.startsWith('-') && !raw.startsWith('\\')) newLine++;
  }
  return { findings, addedLines };
}

/**
 * Kept-dark scan: the full head-tree content of a launch/core file the diff
 * touches. Findings on lines this diff did not add are pre-existing hides
 * the PR keeps (JOV-13132 inventory leftovers).
 */
export function scanKept(file, content, addedLines) {
  if (!isScannableFile(file)) return [];
  const kept = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hit = scanLine(lines[i]);
    if (!hit) continue;
    if (addedLines?.has(i + 1)) continue;
    kept.push({
      file,
      line: i + 1,
      class: 'kept',
      ...hit,
      snippet: lines[i].trim().slice(0, 160),
    });
  }
  return kept;
}

function loadHeadFile(root, file) {
  try {
    return readFileSync(join(root, file), 'utf8');
  } catch {
    return null;
  }
}

function annotate(finding) {
  const label = finding.patterns.join('+');
  return `::error file=${finding.file}#L${finding.line}::launch-core-flag-check: ${finding.class} ${label} — ${finding.matched} hiding launch/core behavior (contract §1.16 / JOV-13132): ${finding.snippet}`;
}

/**
 * --diff-file <path>  evaluate a unified diff (simulation / offline runs)
 * [--json]            machine-readable findings
 * [<base-ref>]        diff HEAD against <base-ref> (defaults to main)
 *
 * Exit 0 clean, 1 findings, 2 usage or git failure (fails closed).
 */
export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const diffFlag = argv.indexOf('--diff-file');
  let diffText;
  const root = '.';
  let diffFileMode = false;
  if (diffFlag >= 0) {
    const path = argv[diffFlag + 1];
    if (!path) {
      console.error('launch-core-flag-check: --diff-file requires a path');
      return 2;
    }
    diffText = readFileSync(path, 'utf8');
    diffFileMode = true;
  } else {
    let positional;
    for (let i = 0; i < argv.length; i++) {
      if (i === diffFlag || i === diffFlag + 1 || argv[i] === '--json')
        continue;
      positional = argv[i];
      break;
    }
    const base = positional ?? 'main';
    const ref = resolveBaseRef(root, base);
    if (!ref) {
      console.error(
        `::error::launch-core-flag-check: cannot resolve diff base "${base}" — failing closed`
      );
      return 2;
    }
    diffText = execFileSync(
      'git',
      ['diff', '--no-color', '--unified=0', ref, 'HEAD'],
      { maxBuffer: 256 * 1024 * 1024 }
    ).toString();
  }
  const { findings: added, addedLines } = scanDiff(diffText);
  const findings = added.map(f => ({ ...f }));
  // "Keeps" half: full head-tree scan of touched launch/core files. In
  // diff-file mode there is no tree to read, so only added lines report.
  if (!diffFileMode) {
    for (const [file, lines] of addedLines) {
      const content = loadHeadFile(root, file);
      if (content === null) continue;
      findings.push(...scanKept(file, content, lines));
    }
  }
  if (json) console.log(JSON.stringify({ findings }, null, 2));
  else {
    for (const f of findings) console.error(annotate(f));
    console.log(
      `launch-core-flag-check: ${findings.length ? 'FAIL' : 'ok'} (${
        findings.filter(f => f.class === 'added').length
      } added, ${findings.filter(f => f.class === 'kept').length} kept)`
    );
  }
  return findings.length ? 1 : 0;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.exit(main());
}
