#!/usr/bin/env node
/** Screen certification gate (JOV-INV-018). Usage: pnpm screen-certification-gate */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '../..');
export const SCREEN_CERT_INVARIANT_ID = 'JOV-INV-018';
export const SCREEN_CERT_SCHEMA = 'screen-certification/v2';
export const SCREEN_BROWSER_PROOF_SCHEMA = 'screen-browser-proof/v1';
export const SCREEN_CERT_GATE = 'screen-certification-gate';
export const SCREEN_REGISTRATION_GATE = 'screen-registration-gate';
export const CLS_INTERACTION_BUDGET = 0.05;
export const SCREEN_PLATFORMS = Object.freeze(['web', 'macos-electron', 'ios']);
export const EXCLUDED_OWNERS = Object.freeze([
  'ovie',
  'auth-security',
  'macos-menu-monitor',
  'ios-shell',
]);
export const RETAINED_SWEEP_WORKFLOWS = Object.freeze([
  // JOV-5852: screenshots.yml is path-complete on push to main + manual
  // dispatch (its daily cron was retired); live external drift keeps a sweep.
  { path: '.github/workflows/visual-a11y.yml', cron: '37 7 * * *' },
]);

/**
 * @typedef {
 *   | 'apps/web/app/(dynamic)/start/page.tsx'
 *   | 'apps/web/app/app/(shell)/page.tsx'
 *   | 'apps/web/app/app/(shell)/jovie-work/page.tsx'
 *   | 'apps/web/app/app/(shell)/settings/billing/page.tsx'
 *   | 'apps/web/app/onboarding/checkout/page.tsx'
 *   | 'apps/web/app/billing/success/page.tsx'
 * } ProtectedRevenueScreenSource
 */

/** @type {Readonly<Record<ProtectedRevenueScreenSource, true>>} */
export const PROTECTED_REVENUE_SCREEN_SOURCES = Object.freeze({
  'apps/web/app/(dynamic)/start/page.tsx': true,
  'apps/web/app/app/(shell)/page.tsx': true,
  'apps/web/app/app/(shell)/jovie-work/page.tsx': true,
  'apps/web/app/app/(shell)/settings/billing/page.tsx': true,
  'apps/web/app/onboarding/checkout/page.tsx': true,
  'apps/web/app/billing/success/page.tsx': true,
});

function parseRegistry(raw) {
  return raw
    .trim()
    .split('\n')
    .map(line => {
      const [id, platform, owner, sources, viewports, flag, reason] =
        line.split('|');
      return Object.freeze({
        id,
        platform,
        owner,
        sources: sources.split(','),
        viewports: viewports.split(','),
        ...(flag === 'x' ? { excluded: true, reason } : {}),
      });
    });
}

/** @type {readonly object[]} */
export const SCREEN_REGISTRY = Object.freeze(
  parseRegistry(
    `
web.homepage|web|marketing-home|apps/web/app/(home)/page.tsx,apps/web/app/(home)/layout.tsx|desktop,mobile
web.waitlist|web|marketing-waitlist|apps/web/app/waitlist/page.tsx,apps/web/app/waitlist/layout.tsx|desktop,mobile
web.developers|web|developer-documentation|apps/web/app/(marketing)/developers/page.tsx|desktop,mobile
web.api-versioning-policy|web|api-versioning-policy|apps/web/app/(marketing)/api-versioning/page.tsx|desktop,mobile
web.cli-landing|web|cli-landing|apps/web/app/(marketing)/cli/page.tsx|desktop,mobile
web.engineering-publication|web|engineering-publication|apps/web/app/(marketing)/engineering/|desktop,mobile
web.changelog|web|changelog|apps/web/app/(marketing)/changelog/|desktop,mobile
web.marketing-ai|web|marketing-ai|apps/web/app/(marketing)/ai/page.tsx|desktop,mobile
web.marketing-alternatives|web|marketing-alternatives|apps/web/app/(marketing)/alternatives/|desktop,mobile
web.marketing-download|web|marketing-download|apps/web/app/(marketing)/download/page.tsx|desktop,mobile
web.marketing-investors|web|marketing-investors|apps/web/app/(marketing)/investors/page.tsx|desktop,mobile
web.marketing-launch|web|marketing-launch|apps/web/app/(marketing)/launch/page.tsx|desktop,mobile
web.marketing-not-found|web|marketing-not-found|apps/web/app/(marketing)/not-found.tsx|desktop,mobile
web.marketing-renders|web|marketing-renders|apps/web/app/(marketing)/renders/|desktop,mobile
web.app-not-found|web|app-shell-not-found|apps/web/app/app/not-found.tsx|desktop,mobile
web.exp-library-v1|web|exp-library-v1|apps/web/app/exp/library-v1/page.tsx|desktop,mobile
web.public-profile|web|public-profile|apps/web/app/[username]/page.tsx|desktop,mobile
web.release-landing|web|release-landing|apps/web/app/r/[slug]/page.tsx,apps/web/app/r/[slug]/ReleaseLandingPage.tsx|desktop,mobile
web.dashboard-releases|web|dashboard-releases|apps/web/app/app/(shell)/dashboard/releases/page.tsx|desktop,mobile
web.library|web|library|apps/web/app/app/(shell)/library/page.tsx|desktop,mobile
web.settings-artist-profile|web|settings-artist-profile|apps/web/app/app/(shell)/settings/artist-profile/page.tsx|desktop,mobile
web.investor-updates|web|investor-updates|apps/web/app/app/(shell)/admin/investors/updates/page.tsx|desktop,mobile
web.investor-pipeline|web|investor-pipeline|apps/web/app/app/(shell)/admin/investors/page.tsx|desktop,mobile
web.start|web|organism.onboarding-chat|apps/web/app/(dynamic)/start/page.tsx|desktop,mobile
web.app-root|web|screen.root|apps/web/app/app/(shell)/page.tsx|desktop,mobile
web.jovie-work|web|screen.jovie.work|apps/web/app/app/(shell)/jovie-work/page.tsx|desktop,mobile
web.settings-billing|web|screen.settings.billing|apps/web/app/app/(shell)/settings/billing/page.tsx|desktop,mobile
web.profile-download|web|profile-download-gate|apps/web/app/[username]/[slug]/download/page.tsx|desktop,mobile
web.dashboard-downloads|web|dashboard-downloads|apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx|desktop,mobile
web.onboarding-checkout|web|onboarding-checkout|apps/web/app/onboarding/checkout/page.tsx|desktop,mobile
web.billing-success|web|billing-success|apps/web/app/billing/success/page.tsx|desktop,mobile
web.root-error-boundary|web|screen.errors.root|apps/web/app/error.tsx,apps/web/app/global-error.tsx|desktop,mobile
macos-electron.hud|macos-electron|desktop-hud|apps/desktop/src/main.ts,apps/desktop/src/navigation.ts|desktop
ios.dashboard|ios|ios-dashboard|apps/ios/Jovie/Features/Dashboard/DashboardView.swift,apps/ios/Jovie/Features/Dashboard/PublicProfileBrowserView.swift|compact
ios.settings|ios|ios-settings|apps/ios/Jovie/Features/Settings/SettingsView.swift|compact
ios.library|ios|ios-library|apps/ios/Jovie/Features/Library/|compact
macos-electron.ovie-door|macos-electron|ovie|apps/desktop/src/ovie-door.ts|desktop|x|Product-surface implementation owned by Ovie
macos-electron.auth-security|macos-electron|auth-security|apps/desktop/src/desktop-auth-security.ts|desktop|x|Auth/security lane is out of scope
web.auth|web|auth-security|apps/web/app/(auth)/|desktop,mobile|x|Auth/security lane is out of scope
macos.menu-monitor|macos-electron|macos-menu-monitor|apps/macos/MenuMonitor/|desktop|x|MenuMonitor is out of scope
ios.auth|ios|auth-security|apps/ios/Jovie/Features/Auth/|compact|x|Auth/security lane is out of scope
ios.shell|ios|ios-shell|apps/ios/Jovie/Features/AppShell/|compact|x|iOS shell lane is out of scope
`.trim()
  )
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRepoPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/');
}

function matchesSource(file, source) {
  const path = normalizeRepoPath(file);
  const target = normalizeRepoPath(source);
  return (
    path === target ||
    path.startsWith(target.endsWith('/') ? target : `${target}/`)
  );
}

export function isScreenLikePath(path) {
  const normalized = normalizeRepoPath(path);
  if (normalized.startsWith('apps/macos/MenuMonitor/')) return true;
  if (
    normalized === 'apps/desktop/src/main.ts' ||
    normalized === 'apps/desktop/src/navigation.ts' ||
    normalized === 'apps/desktop/src/tray.ts' ||
    normalized === 'apps/desktop/src/ovie-door.ts' ||
    normalized === 'apps/desktop/src/desktop-auth-security.ts'
  ) {
    return true;
  }
  if (
    normalized.startsWith('apps/web/app/') &&
    (/(?:^|\/)(?:page|layout|loading|error|global-error|default|not-found|template)\.tsx$/.test(
      normalized
    ) ||
      normalized.endsWith('ReleaseLandingPage.tsx'))
  ) {
    return true;
  }
  if (
    normalized.startsWith('apps/desktop/src/renderer/') &&
    /(?:View|Screen|App)\.tsx$/.test(normalized)
  ) {
    return true;
  }
  if (!normalized.startsWith('apps/ios/Jovie/Features/')) return false;
  if (
    !normalized.endsWith('View.swift') &&
    !normalized.endsWith('Screen.swift') &&
    !normalized.endsWith('Sheet.swift')
  ) {
    return false;
  }
  return !/(?:Card|Placeholder|Options|ToolCard)View\.swift$/.test(normalized);
}

/** @param {string} path @param {readonly object[]} [registry] */
export function classifyScreenPath(path, registry = SCREEN_REGISTRY) {
  const normalized = normalizeRepoPath(path);
  for (const kind of /** @type {const} */ (['excluded', 'registered'])) {
    const excluded = kind === 'excluded';
    for (const entry of registry) {
      if (Boolean(entry.excluded) !== excluded) continue;
      if (entry.sources.some(source => matchesSource(normalized, source))) {
        return { kind, entry };
      }
    }
  }
  if (isScreenLikePath(normalized))
    return { kind: 'unregistered', entry: null };
  return { kind: 'out-of-scope', entry: null };
}

function normalizeChanged(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map(item => {
      if (typeof item === 'string')
        return { path: normalizeRepoPath(item), status: 'M' };
      if (!isObject(item) || typeof item.path !== 'string') return null;
      const status =
        typeof item.status === 'string' && item.status
          ? item.status.toUpperCase()
          : 'M';
      return { path: normalizeRepoPath(item.path), status };
    })
    .filter(Boolean);
}

/** Deliberate-red fixture only. Never used to certify a changed surface. */
function makeDeliberateRedProof(screen, headSha) {
  return {
    schema: SCREEN_BROWSER_PROOF_SCHEMA,
    producer: 'external-render-runner',
    screenId: screen.id,
    headSha,
    tier: 'rendered-evidence',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    artifactDigest: `sha256:${'a'.repeat(64)}`,
    capturedAt: '2026-09-02T00:00:00.000Z',
    viewports: screen.viewports.map(id => ({
      id,
      decision: 'pass',
      rendered: true,
      axe: { violations: 0 },
      overflow: { maxHorizontalPx: 0 },
      interaction: { passed: true },
      cls: { value: 0 },
    })),
    activeFlow: { disclosure: false },
    historyProof: { separate: true, path: 'docs/VISUAL_TESTING_POLICY.md' },
    visibleActions: ['Certify', 'Block'],
  };
}

/**
 * Deterministic sha256 over rendered artifact bytes: a single file hashes its
 * bytes; a directory hashes its sorted relative paths plus file bytes so the
 * whole bundle is bound to the proof.
 *
 * @param {string} artifactPath absolute path to a file or directory
 * @returns {string | null} `sha256:<64 hex>`, or null when unreadable/empty
 */
export function hashArtifactBytes(artifactPath) {
  const stat = statSync(artifactPath, { throwIfNoEntry: false });
  if (!stat) return null;
  const hash = createHash('sha256');
  if (stat.isFile()) {
    hash.update(readFileSync(artifactPath));
    return `sha256:${hash.digest('hex')}`;
  }
  if (!stat.isDirectory()) return null;
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) files.push(abs);
    }
  };
  walk(artifactPath);
  if (files.length === 0) return null;
  files.sort();
  for (const file of files) {
    hash.update(relative(artifactPath, file).replace(/\\/g, '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Legacy local-byte consistency helper. It proves only that a caller-selected
 * path matches a caller-selected digest; it is deliberately not used by the
 * certification gate and cannot establish browser-execution provenance.
 *
 * @param {any} proof
 * @param {{ artifactRoot?: string }} [options]
 * @returns {string | null} a finding, or null when the bytes verify
 */
export function verifyProofArtifact(proof, { artifactRoot = REPO_ROOT } = {}) {
  const artifactPath =
    typeof proof?.artifactPath === 'string' ? proof.artifactPath : '';
  if (!artifactPath) {
    return 'proof artifactPath is required; caller-authored proof cannot certify';
  }
  const root = resolve(artifactRoot);
  const resolved = resolve(root, artifactPath);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    return `proof artifactPath escapes the artifact root: ${artifactPath}`;
  }
  const digest = hashArtifactBytes(resolved);
  if (digest === null) {
    return `proof artifact bytes are unreadable: ${artifactPath}`;
  }
  const claimed =
    typeof proof?.artifactDigest === 'string'
      ? proof.artifactDigest.toLowerCase()
      : '';
  if (/^sha256:[0-9a-f]{64}$/.test(claimed) && digest !== claimed) {
    return 'proof artifactDigest does not match the rendered artifact bytes';
  }
  return null;
}

/**
 * @param {any} proof
 * @param {{ screen: object, headSha: string }} context
 */
export function evaluateScreenProof(proof, { screen, headSha }) {
  const findings = [];
  if (!isObject(proof) || proof.schema !== SCREEN_BROWSER_PROOF_SCHEMA) {
    return ['proof schema must be screen-browser-proof/v1'];
  }
  if (proof.producer !== 'external-render-runner') {
    findings.push('proof producer must be external-render-runner');
  }
  if (proof.status !== 'unverified-candidate') {
    findings.push(
      'proof status must be unverified-candidate before resolver verification'
    );
  }
  if (proof.certificationStatus !== 'not-certified') {
    findings.push('proof certificationStatus must be not-certified');
  }
  if (proof.screenId !== screen.id) {
    findings.push(
      `proof screenId ${proof.screenId ?? '<missing>'} does not match ${screen.id}`
    );
  }
  const proofHead =
    typeof proof.headSha === 'string' ? proof.headSha.toLowerCase() : '';
  if (!headSha || proofHead !== headSha.toLowerCase()) {
    findings.push(`stale or missing exact-head proof for ${screen.id}`);
  }
  if (proof.tier === 'scheduled-sweep') {
    findings.push('scheduled-sweep cannot satisfy changed-surface proof');
  } else if (proof.tier !== 'rendered-evidence') {
    findings.push('proof tier must be rendered-evidence');
  }
  if (
    typeof proof.runUrl !== 'string' ||
    !/^https:\/\/[^\s]+$/i.test(proof.runUrl)
  ) {
    findings.push('proof runUrl must be an https URL');
  }
  if (
    typeof proof.artifactDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/i.test(proof.artifactDigest)
  ) {
    findings.push('proof artifactDigest must be sha256:<64 hex>');
  }
  if (
    typeof proof.capturedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(
      proof.capturedAt
    ) ||
    !Number.isFinite(Date.parse(proof.capturedAt))
  ) {
    findings.push('proof capturedAt must be an ISO timestamp');
  }
  const viewports = Array.isArray(proof.viewports) ? proof.viewports : [];
  const seen = new Map();
  for (const viewport of viewports) {
    const id = isObject(viewport) ? viewport.id : null;
    if (typeof id !== 'string' || id.trim() === '') {
      findings.push('viewport is missing an id');
      continue;
    }
    if (seen.has(id))
      findings.push(`viewport ${id} has more than one decision`);
    seen.set(id, viewport);
    if (
      typeof viewport.decision !== 'string' ||
      viewport.decision.trim() === ''
    ) {
      findings.push(`viewport ${id} is missing a decision`);
    } else if (viewport.decision !== 'pass') {
      findings.push(`viewport ${id} decision must be pass`);
    }
    if (viewport.rendered !== true) {
      findings.push(`viewport ${id} was not rendered`);
    }
    if (viewport.axe?.violations !== 0) {
      findings.push(`viewport ${id} axe violations must be zero`);
    }
    const overflow = viewport.overflow?.maxHorizontalPx;
    if (typeof overflow !== 'number' || overflow < 0 || overflow > 1) {
      findings.push(`viewport ${id} horizontal overflow exceeds 1px`);
    }
    if (viewport.interaction?.passed !== true) {
      findings.push(`viewport ${id} interaction check did not pass`);
    }
    const cls = viewport.cls?.value;
    if (typeof cls !== 'number' || cls < 0 || cls > CLS_INTERACTION_BUDGET) {
      findings.push(`viewport ${id} CLS exceeds ${CLS_INTERACTION_BUDGET}`);
    }
  }
  for (const id of screen.viewports) {
    if (!seen.has(id)) findings.push(`viewport ${id} is missing a decision`);
  }
  if (proof.activeFlow?.disclosure) {
    findings.push('disclosure must not appear in the active flow');
  }
  if (isObject(proof.activeFlow) && 'historyProof' in proof.activeFlow) {
    findings.push('history/proof must be separate from the active flow');
  }
  if (!isObject(proof.historyProof) || proof.historyProof.separate !== true) {
    findings.push('history/proof must be a separate artifact');
  }
  const actions = proof.visibleActions;
  if (
    !Array.isArray(actions) ||
    actions.length === 0 ||
    actions.some(action => typeof action !== 'string' || action.trim() === '')
  ) {
    findings.push('visible actions are required');
  }
  // A local path and digest are caller-controlled. The existing Playwright
  // transport does not yet expose a success-run resolver/decoded bundle, so
  // external certification must fail closed until that adapter exists.
  findings.push(
    'trusted external browser producer integration is unavailable; supplied proof cannot certify'
  );
  return findings;
}

export const DELIBERATE_RED_FIXTURES = Object.freeze([
  {
    id: 'deliberate-red.missing-registration',
    kind: 'missing-registration',
    changedFiles: [
      { path: 'apps/web/app/(home)/unregistered/page.tsx', status: 'A' },
    ],
  },
  {
    id: 'deliberate-red.modified-protected-missing-registration',
    kind: 'missing-registration',
    removeScreenId: 'web.jovie-work',
    changedFiles: [
      {
        path: 'apps/web/app/app/(shell)/jovie-work/page.tsx',
        status: 'M',
      },
    ],
  },
  {
    id: 'deliberate-red.stale-head',
    kind: 'stale-head',
    screenId: 'web.homepage',
  },
  {
    id: 'deliberate-red.scheduled-sweep-as-changed-surface',
    kind: 'scheduled-sweep',
    screenId: 'web.homepage',
  },
  {
    id: 'deliberate-red.two-decisions-one-viewport',
    kind: 'decision-review',
    proof: {
      viewports: [
        { id: 'desktop', decision: 'pass' },
        { id: 'desktop', decision: 'block' },
        { id: 'mobile', decision: 'pass' },
      ],
    },
  },
  {
    id: 'deliberate-red.active-flow-disclosure',
    kind: 'decision-review',
    proof: { activeFlow: { disclosure: true } },
  },
  {
    id: 'deliberate-red.mixed-history',
    kind: 'decision-review',
    proof: {
      activeFlow: { disclosure: false, historyProof: { separate: false } },
    },
  },
  {
    id: 'deliberate-red.hidden-actions',
    kind: 'decision-review',
    proof: { visibleActions: [] },
  },
]);

/** @param {readonly object[]} [registry] */
export function validateScreenRegistry(
  registry = SCREEN_REGISTRY,
  { repoRoot = REPO_ROOT, verifySources = true } = {}
) {
  const issues = [];
  if (!Array.isArray(registry) || registry.length === 0)
    return ['screen registry is empty'];
  const ids = new Set();
  const platforms = new Set();
  for (const entry of registry) {
    if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id) {
      issues.push('screen entry is missing a stable id');
      continue;
    }
    if (ids.has(entry.id)) issues.push(`duplicate screen id ${entry.id}`);
    ids.add(entry.id);
    if (!SCREEN_PLATFORMS.includes(entry.platform)) {
      issues.push(`${entry.id}: platform must be web|macos-electron|ios`);
    }
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      issues.push(`${entry.id}: sources must be non-empty`);
    }
    if (!Array.isArray(entry.viewports) || entry.viewports.length === 0) {
      issues.push(`${entry.id}: viewports must be non-empty`);
    }
    if (!entry.excluded && entry.platform === 'web') {
      for (const viewport of ['desktop', 'mobile']) {
        if (!entry.viewports?.includes(viewport)) {
          issues.push(`${entry.id}: web screens must include ${viewport}`);
        }
      }
    }
    if (entry.excluded) {
      if (!EXCLUDED_OWNERS.includes(entry.owner)) {
        issues.push(
          `${entry.id}: excluded owner ${entry.owner} is not allowed`
        );
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        issues.push(`${entry.id}: excluded screens require a reason`);
      }
    } else {
      platforms.add(entry.platform);
      if (EXCLUDED_OWNERS.includes(entry.owner)) {
        issues.push(
          `${entry.id}: excluded owner ${entry.owner} cannot own a gated screen`
        );
      }
    }
    if (verifySources) {
      for (const source of entry.sources || []) {
        if (!existsSync(resolve(repoRoot, source))) {
          issues.push(`${entry.id}: source ${source} is missing`);
        }
      }
    }
  }
  for (const platform of SCREEN_PLATFORMS) {
    if (!platforms.has(platform))
      issues.push(`registry is missing a gated ${platform} screen`);
  }
  return issues;
}

/** @param {readonly object[]} [registry] */
export function validateProtectedRevenueScreenRegistry(
  registry = SCREEN_REGISTRY
) {
  const issues = [];
  for (const source of Object.keys(PROTECTED_REVENUE_SCREEN_SOURCES)) {
    const owners = registry.filter(
      entry =>
        !entry.excluded &&
        Array.isArray(entry.sources) &&
        entry.sources.some(candidate => normalizeRepoPath(candidate) === source)
    );
    if (owners.length !== 1) {
      issues.push(
        `protected revenue screen ${source} must have exactly one non-excluded registry owner; found ${owners.length}`
      );
      continue;
    }
    const viewports = new Set(owners[0].viewports || []);
    for (const viewport of ['desktop', 'mobile']) {
      if (!viewports.has(viewport)) {
        issues.push(
          `protected revenue screen ${source} must include ${viewport} viewport proof`
        );
      }
    }
  }
  return issues;
}

export function validateRetainedSweeps({
  repoRoot = REPO_ROOT,
  workflows = RETAINED_SWEEP_WORKFLOWS,
} = {}) {
  const issues = [];
  if (!Array.isArray(workflows) || workflows.length === 0) {
    return ['scheduled whole-system sweeps are missing'];
  }
  for (const workflow of workflows) {
    const abs = resolve(repoRoot, workflow.path);
    if (!existsSync(abs)) {
      issues.push(`scheduled sweep ${workflow.path} is missing`);
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    if (!/\n  schedule:\n/.test(`\n${text}`) || !/cron:/.test(text)) {
      issues.push(`scheduled sweep ${workflow.path} dropped its schedule`);
    }
    if (workflow.cron && !text.includes(workflow.cron)) {
      issues.push(
        `scheduled sweep ${workflow.path} dropped cron ${workflow.cron}`
      );
    }
  }
  return issues;
}

function resolveHeadSha(explicit, repoRoot = REPO_ROOT) {
  if (typeof explicit === 'string' && /^[0-9a-f]{40}$/i.test(explicit)) {
    return explicit.toLowerCase();
  }
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const sha = result.stdout?.trim() ?? '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `screen certification failed closed: exact HEAD SHA is unreadable (${result.stderr?.trim() || sha || 'empty'})`
    );
  }
  return sha.toLowerCase();
}

function resolveDiffBase(explicit, repoRoot = REPO_ROOT) {
  if (explicit) return explicit;
  if (process.env.SCREEN_CERT_DIFF_BASE)
    return process.env.SCREEN_CERT_DIFF_BASE;
  if (process.env.COMPONENT_SHIP_DIFF_BASE)
    return process.env.COMPONENT_SHIP_DIFF_BASE;
  if (process.env.TURBO_SCM_BASE) return process.env.TURBO_SCM_BASE;
  const probe = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return probe.status === 0 ? 'origin/main' : null;
}

function resolveCommitSha(ref, repoRoot = REPO_ROOT) {
  if (!ref) return null;
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `${ref}^{commit}`],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  const sha = result.stdout?.trim() ?? '';
  if (result.status !== 0 || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error(
      `screen certification diff base is not an exact commit: ${ref}`
    );
  }
  return sha.toLowerCase();
}

function changedFilesFromGit(diffBase, repoRoot = REPO_ROOT) {
  if (!diffBase) return [];
  const result = spawnSync(
    'git',
    ['diff', '--diff-filter=ACDMR', '--name-status', `${diffBase}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `could not resolve changed files from ${diffBase}: ${result.stderr?.trim() || result.stdout}`
    );
  }
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const parts = line.split('\t');
      if (parts.length === 1)
        return { path: normalizeRepoPath(parts[0]), status: 'M' };
      const status = parts[0].trim().charAt(0).toUpperCase();
      if (status === 'R' && parts.length >= 3) {
        return [
          { status, path: normalizeRepoPath(parts[1]) },
          { status, path: normalizeRepoPath(parts[2]) },
        ];
      }
      return {
        status,
        path: normalizeRepoPath(parts[parts.length - 1]),
      };
    });
}

function evaluateDeliberateRed({ registry, headSha, fixtures }) {
  const receipts = [];
  const issues = [];
  for (const fixture of fixtures) {
    const findings = [];
    if (fixture.kind === 'missing-registration') {
      const fixtureRegistry = fixture.removeScreenId
        ? registry.filter(entry => entry.id !== fixture.removeScreenId)
        : registry;
      findings.push(
        ...evaluateChangedScreens({
          changedFiles: fixture.changedFiles,
          registry: fixtureRegistry,
          headSha,
          proofs: [],
          requireExternalEvidence: true,
        }).issues
      );
    } else if (
      fixture.kind === 'stale-head' ||
      fixture.kind === 'scheduled-sweep'
    ) {
      const screen = registry.find(entry => entry.id === fixture.screenId);
      const proof = makeDeliberateRedProof(
        screen,
        fixture.kind === 'stale-head' ? '0'.repeat(40) : headSha
      );
      if (fixture.kind === 'scheduled-sweep') proof.tier = 'scheduled-sweep';
      findings.push(...evaluateScreenProof(proof, { screen, headSha }));
    } else if (fixture.kind === 'decision-review') {
      const screen = registry.find(entry => !entry.excluded);
      const base = makeDeliberateRedProof(screen, headSha);
      const proof = {
        ...base,
        ...fixture.proof,
        activeFlow: {
          ...base.activeFlow,
          ...(fixture.proof?.activeFlow || {}),
        },
      };
      findings.push(...evaluateScreenProof(proof, { screen, headSha }));
    } else {
      findings.push(`${fixture.id}: unknown deliberate-red kind`);
    }
    if (findings.length === 0)
      issues.push(`${fixture.id}: deliberate-red fixture must block`);
    receipts.push({
      id: fixture.id,
      kind: fixture.kind,
      verdict: findings.length > 0 ? 'block' : 'pass',
      findings,
    });
  }
  return { receipts, issues };
}

export function evaluateChangedScreens({
  changedFiles,
  registry = SCREEN_REGISTRY,
  headSha,
  proofs = [],
  requireExternalEvidence = false,
}) {
  const issues = [];
  const changedScreens = [];
  const excludedChanges = [];
  const supplied = new Map();
  for (const proof of proofs || []) {
    if (isObject(proof) && typeof proof.screenId === 'string') {
      if (supplied.has(proof.screenId)) {
        issues.push(`duplicate proof for ${proof.screenId}`);
      }
      supplied.set(proof.screenId, proof);
    }
  }
  const seen = new Set();
  for (const file of normalizeChanged(changedFiles)) {
    const classified = classifyScreenPath(file.path, registry);
    if (classified.kind === 'excluded') {
      excludedChanges.push({
        path: file.path,
        screenId: classified.entry.id,
        owner: classified.entry.owner,
      });
      continue;
    }
    if (classified.kind === 'out-of-scope') continue;
    if (classified.kind === 'unregistered') {
      issues.push(
        `missing registration for changed in-scope screen ${file.path}`
      );
      continue;
    }
    const screen = classified.entry;
    if (seen.has(screen.id)) continue;
    seen.add(screen.id);
    const proof = supplied.get(screen.id) || null;
    if (!proof) {
      const detail = requireExternalEvidence
        ? `missing exact-head proof for ${screen.id}`
        : null;
      if (detail) issues.push(detail);
      changedScreens.push({
        id: screen.id,
        verdict: requireExternalEvidence ? 'block' : 'evidence-required',
        findings: detail ? [detail] : [],
      });
      continue;
    }
    const findings = evaluateScreenProof(proof, {
      screen,
      headSha,
    });
    if (findings.length > 0)
      issues.push(`${screen.id}: ${findings.join('; ')}`);
    changedScreens.push({
      id: screen.id,
      verdict: findings.length === 0 ? 'pass' : 'block',
      findings,
      // Renderer provenance + immutable artifact identity ride the receipt
      // for every certified screen.
      ...(findings.length === 0
        ? { artifactDigest: proof.artifactDigest, rendererRunUrl: proof.runUrl }
        : {}),
    });
  }
  for (const screenId of supplied.keys()) {
    if (!seen.has(screenId)) {
      issues.push(`proof supplied for unchanged or unknown screen ${screenId}`);
    }
  }
  return { issues, changedScreens, excludedChanges };
}

export function runScreenCertification(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const registry = options.registry ?? SCREEN_REGISTRY;
  const headSha = resolveHeadSha(options.headSha, repoRoot);
  const issues = [
    ...validateScreenRegistry(registry, {
      repoRoot,
      verifySources: options.verifySources !== false,
    }),
    ...validateProtectedRevenueScreenRegistry(registry),
    ...validateRetainedSweeps({
      repoRoot,
      workflows: options.workflows ?? RETAINED_SWEEP_WORKFLOWS,
    }),
  ];
  const fixtures = options.redFixtures ?? DELIBERATE_RED_FIXTURES;
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    issues.push('deliberate-red fixtures are missing; fail closed');
  }
  const red = evaluateDeliberateRed({
    registry,
    headSha,
    fixtures: fixtures ?? [],
  });
  issues.push(...red.issues);
  const diffBase =
    options.diffBase ?? resolveDiffBase(options.diffBase, repoRoot);
  const baseSha = options.changedFiles
    ? null
    : resolveCommitSha(diffBase, repoRoot);
  if (!options.changedFiles && (!baseSha || baseSha === headSha)) {
    issues.push('screen diff base must resolve and differ from exact HEAD');
  }
  const changedFiles =
    options.changedFiles ?? changedFilesFromGit(diffBase, repoRoot);
  const changed = evaluateChangedScreens({
    changedFiles,
    registry,
    headSha,
    proofs: options.proofs,
    requireExternalEvidence: options.registrationOnly !== true,
  });
  issues.push(...changed.issues);
  const ok = issues.length === 0;
  // The future trusted producer adapter may make external certification real.
  // Registration-only audits and no-change runs never certify.
  const certified =
    ok &&
    options.registrationOnly !== true &&
    changed.changedScreens.length > 0;
  const status = !ok
    ? issues.some(issue =>
        issue.includes('external browser producer integration is unavailable')
      )
      ? 'external-certification-unavailable'
      : 'blocked'
    : certified
      ? 'certified'
      : changed.changedScreens.length > 0
        ? options.registrationOnly === true
          ? 'source-registered'
          : 'evidence-required'
        : 'not-applicable';
  return {
    ok,
    schema: SCREEN_CERT_SCHEMA,
    receipt: {
      schema: SCREEN_CERT_SCHEMA,
      gate:
        options.registrationOnly === true
          ? SCREEN_REGISTRATION_GATE
          : SCREEN_CERT_GATE,
      invariant: SCREEN_CERT_INVARIANT_ID,
      headSha,
      baseSha,
      ok,
      certified,
      registrationOnly: options.registrationOnly === true,
      status,
      issues,
      changedScreens: changed.changedScreens,
      excludedChanges: changed.excludedChanges,
      fixtures: red.receipts,
      sweeps: (options.workflows ?? RETAINED_SWEEP_WORKFLOWS).map(item => ({
        path: item.path,
        retained: true,
      })),
    },
  };
}

/**
 * Reserved external-certification entrypoint. It accepts no verifier callback
 * and remains unavailable until the dependent authoritative source-continuity
 * adapter binds a GitHub push event to the immutable artifact.
 * @param {{ artifactId?: number; screenId?: string; repoRoot?: string }} options
 */
export function runScreenCertificationFromArtifact({
  artifactId,
  screenId,
  repoRoot = REPO_ROOT,
} = {}) {
  const headSha = resolveHeadSha(undefined, repoRoot);
  const screen = SCREEN_REGISTRY.find(
    entry => !entry.excluded && entry.id === screenId
  );
  // An immutable artifact alone cannot establish which push event introduced
  // the registered source change. The post-run GitHub compare binding belongs
  // to the dependent continuity slice; do not substitute local git history.
  void artifactId;
  const issue =
    'artifact certification is unavailable until authoritative GitHub event source continuity is verified';
  return {
    ok: false,
    schema: SCREEN_CERT_SCHEMA,
    receipt: {
      gate: SCREEN_CERT_GATE,
      invariant: SCREEN_CERT_INVARIANT_ID,
      headSha,
      baseSha: null,
      ok: false,
      certified: false,
      registrationOnly: false,
      status: 'external-certification-unavailable',
      issues: [issue],
      changedScreens: screen
        ? [{ id: screenId, verdict: 'block', findings: [issue] }]
        : [],
      excludedChanges: [],
      fixtures: [],
      sweeps: RETAINED_SWEEP_WORKFLOWS.map(item => ({
        path: item.path,
        retained: true,
      })),
    },
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const diffBase = process.argv
    .find(arg => arg.startsWith('--diff-base='))
    ?.slice(12);
  const proofFile = process.argv
    .find(arg => arg.startsWith('--proof-file='))
    ?.slice('--proof-file='.length);
  const artifactRoot = process.argv
    .find(arg => arg.startsWith('--artifact-root='))
    ?.slice('--artifact-root='.length);
  const receiptOut = process.argv
    .find(arg => arg.startsWith('--receipt-out='))
    ?.slice('--receipt-out='.length);
  const registrationOnly = process.argv.includes('--registration-only');
  const activeGate = registrationOnly
    ? SCREEN_REGISTRATION_GATE
    : SCREEN_CERT_GATE;
  let proofs = [];
  if (proofFile) {
    const parsed = JSON.parse(readFileSync(resolve(proofFile), 'utf8'));
    proofs = Array.isArray(parsed) ? parsed : parsed.proofs;
    if (!Array.isArray(proofs)) {
      throw new Error('screen proof file must contain an array or { proofs }');
    }
  }
  const result = runScreenCertification({
    diffBase,
    proofs,
    registrationOnly,
    artifactRoot,
  });
  if (receiptOut) {
    // The receipt is the immutable machine record: exact head/base, per-screen
    // verdicts with artifact digest + renderer provenance, and the certified bit.
    writeFileSync(
      resolve(receiptOut),
      `${JSON.stringify(result.receipt, null, 2)}\n`
    );
  }
  if (result.ok) {
    process.stdout.write(
      `[${activeGate}] PASS head=${result.receipt.headSha} changed=${result.receipt.changedScreens.length} status=${result.receipt.status} certified=${result.receipt.certified}\n`
    );
  } else {
    for (const issue of result.receipt.issues) {
      process.stderr.write(`[${activeGate}] ${issue}\n`);
    }
    process.stderr.write(
      `[${activeGate}] FAIL — ${SCREEN_CERT_INVARIANT_ID} ${SCREEN_CERT_SCHEMA}\n`
    );
  }
  process.exit(result.ok ? 0 : 1);
}
