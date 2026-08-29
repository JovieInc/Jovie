#!/usr/bin/env node
/**
 * Design governance audit — the standing drift detector.
 *
 * Fail-closed sweep over the drift classes in docs/design-system/GOVERNANCE.md:
 *   1. Dangling skill symlinks in .claude/skills + stale ownedSkills pins.
 *   2. .claude/skills/gstack is a symlink to the vendored fork.
 *   3. design.tokens.json freshness vs design-system.css (export --check).
 *   4. DESIGN.md Noir Ion sidebar rgb agrees with linear-tokens.css.
 *   5. Enforcement commands exist in package.json. Absence from
 *      ci-fast-lanes.mjs is WARN-only (weekly + local; not a merge gate).
 *   6. code-style.md custom-rule count matches eslint.config.js.
 *   7. DESIGN_COMPLETE.md carries a superseded banner.
 *   8. Design-agent invariants project from canon/invariants.jsonl only.
 *   9. Shared-UI visual arbitrary values are shrink-only (JOV-5437).
 *
 * Invariant consumer: JOV-INV-019.
 *
 * Exit 0 when nothing FAILs (WARN is allowed); exit 1 on any FAIL.
 *
 * Usage:
 *   node scripts/design-governance-audit.mjs
 *   pnpm design:governance:audit
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findDesignManifestProjectionViolations } from './design-authority-guard.mjs';
import { buildLlmsDesignManifest } from './generate-llms-design-manifest.mjs';
import {
  findDesignInvariantProjectionViolations,
  readDesignAgentContract,
} from './invariants/design-agent-contract.mjs';
import {
  evaluateSharedUiVisualArbitraryAudit,
  CHECK_COMMAND as SHARED_UI_VISUAL_ARBITRARY_CHECK,
} from './shared-ui-visual-arbitrary-audit.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.join(THIS_DIR, '..');

const SKILLS_DIR = '.claude/skills';
const GSTACK_LINK = '.claude/skills/gstack';
const GSTACK_TARGET = '.agents/skills/gstack';
const SKILLS_LOCK_PATH = 'skills-lock.json';
const DESIGN_TOKENS_PATH = 'design.tokens.json';
const DESIGN_TOKENS_GENERATOR = 'scripts/generate-design-tokens-export.mjs';
const DESIGN_MD_PATH = 'DESIGN.md';
const LINEAR_TOKENS_PATH = 'apps/web/styles/linear-tokens.css';
const CI_FAST_LANES_PATH = 'scripts/ci-fast-lanes.mjs';
const ROOT_PACKAGE_PATH = 'package.json';
const WEB_PACKAGE_PATH = 'apps/web/package.json';
const ESLINT_CONFIG_PATH = 'apps/web/eslint.config.js';
const CODE_STYLE_RULES_PATH = '.claude/rules/code-style.md';
const DESIGN_COMPLETE_PATH = 'DESIGN_COMPLETE.md';
const LLM_DESIGN_MANIFEST_PATH = 'docs/llms-design-manifest.txt';
const DESIGN_PROJECTION_PROBE = {
  id: 'design-projection-binding-probe',
  statement: 'Executable projection binding probe.',
};

const ROOT_REQUIRED_SCRIPTS = [
  'design:authority:check',
  'design:tokens:export:check',
  'design:governance:audit',
  'design:shared-ui-visual-arbitrary:check',
];
const WEB_REQUIRED_SCRIPTS = ['lint:touch-target', 'lint:eslint'];
const CI_FAST_REQUIRED_COMMANDS = [
  'design:authority:check',
  'lint:touch-target',
  'design:tokens:export:check',
  'design:governance:audit',
];

/** @typedef {{ id: string, status: 'PASS'|'WARN'|'FAIL', detail: string }} CheckResult */

function collectSymlinks(absoluteDir, relativeDir, found = []) {
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      found.push(relative);
    } else if (entry.isDirectory()) {
      collectSymlinks(absolute, relative, found);
    }
  }
  return found;
}

function parseTriplet(text) {
  const match = text?.match(/(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

/**
 * @param {string} [repoRoot]
 * @returns {{ results: CheckResult[], failed: CheckResult[], warned: CheckResult[] }}
 */
export function runDesignGovernanceAudit(repoRoot = DEFAULT_REPO_ROOT) {
  /** @type {CheckResult[]} */
  const results = [];
  const report = (id, status, detail) => {
    results.push({ id, status, detail });
  };
  const readRepoFile = relativePath =>
    readFileSync(path.join(repoRoot, relativePath), 'utf8');

  if (!existsSync(path.join(repoRoot, SKILLS_DIR))) {
    report('skill-symlinks', 'FAIL', `${SKILLS_DIR} is missing`);
  } else {
    const symlinks = collectSymlinks(
      path.join(repoRoot, SKILLS_DIR),
      SKILLS_DIR
    );
    const dangling = symlinks.filter(
      relative => !existsSync(path.join(repoRoot, relative))
    );
    if (dangling.length > 0) {
      report(
        'skill-symlinks',
        'FAIL',
        `${dangling.length} dangling symlink(s) under ${SKILLS_DIR}: ${dangling.join(', ')}`
      );
    } else {
      report(
        'skill-symlinks',
        'PASS',
        `${symlinks.length} symlink(s) under ${SKILLS_DIR} all resolve`
      );
    }
  }

  const gstackAbs = path.join(repoRoot, GSTACK_LINK);
  try {
    const stat = lstatSync(gstackAbs);
    if (!stat.isSymbolicLink()) {
      report(
        'gstack-symlink',
        'FAIL',
        `${GSTACK_LINK} must be a symlink to ${GSTACK_TARGET}`
      );
    } else {
      const resolved = path.resolve(
        path.dirname(gstackAbs),
        readlinkSync(gstackAbs)
      );
      const expected = path.resolve(repoRoot, GSTACK_TARGET);
      if (resolved !== expected) {
        report(
          'gstack-symlink',
          'FAIL',
          `${GSTACK_LINK} -> ${resolved}, expected ${expected}`
        );
      } else if (!existsSync(gstackAbs)) {
        report(
          'gstack-symlink',
          'FAIL',
          `${GSTACK_LINK} is a dangling symlink`
        );
      } else {
        report('gstack-symlink', 'PASS', `${GSTACK_LINK} -> ${GSTACK_TARGET}`);
      }
    }
  } catch (error) {
    report(
      'gstack-symlink',
      'FAIL',
      `${GSTACK_LINK} unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const lock = readJson(repoRoot, SKILLS_LOCK_PATH);
    const owned = Array.isArray(lock.ownedSkills) ? lock.ownedSkills : [];
    const stale = owned.filter(
      name => !existsSync(path.join(repoRoot, SKILLS_DIR, name, 'SKILL.md'))
    );
    if (stale.length > 0) {
      report(
        'skills-lock-pins',
        'FAIL',
        `${stale.length} ownedSkills pin(s) do not resolve to ${SKILLS_DIR}/<name>/SKILL.md: ${stale.join(', ')}`
      );
    } else {
      report(
        'skills-lock-pins',
        'PASS',
        `${owned.length} ownedSkills pin(s) all resolve`
      );
    }
  } catch (error) {
    report(
      'skills-lock-pins',
      'FAIL',
      `${SKILLS_LOCK_PATH} unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  if (!existsSync(path.join(repoRoot, DESIGN_TOKENS_PATH))) {
    report('design-tokens-export', 'FAIL', `${DESIGN_TOKENS_PATH} is missing`);
  } else if (!existsSync(path.join(repoRoot, DESIGN_TOKENS_GENERATOR))) {
    report(
      'design-tokens-export',
      'WARN',
      `${DESIGN_TOKENS_GENERATOR} not present; freshness check skipped until the generator lands`
    );
  } else {
    const result = spawnSync(
      process.execPath,
      [DESIGN_TOKENS_GENERATOR, '--check'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    if (result.status === 0) {
      report(
        'design-tokens-export',
        'PASS',
        `${DESIGN_TOKENS_PATH} matches the design-system.css Noir Ion anchors`
      );
    } else {
      const tail = `${result.stdout ?? ''}${result.stderr ?? ''}`
        .trim()
        .split('\n')
        .slice(-5)
        .join(' | ');
      report(
        'design-tokens-export',
        'FAIL',
        `${DESIGN_TOKENS_PATH} is stale (generator --check failed): ${tail}`
      );
    }
  }

  try {
    const designMd = readRepoFile(DESIGN_MD_PATH);
    const linearTokens = readRepoFile(LINEAR_TOKENS_PATH);
    const noirRow = designMd.match(/^\| *Shell *\|.*$/m)?.[0] ?? null;
    const noirTriplet = parseTriplet(
      noirRow?.match(/sidebar rgb `([^`]+)`/i)?.[1]
    );
    const sidebarSection = designMd.split('### Sidebar (App Shell)')[1] ?? '';
    const backgroundRow =
      sidebarSection.match(/^\| *Background RGB *\|.*$/m)?.[0] ?? null;
    const sidebarCells = backgroundRow
      ? [...backgroundRow.matchAll(/`([^`]+)`/g)].map(match => match[1])
      : [];
    const sidebarTriplet = parseTriplet(sidebarCells[sidebarCells.length - 1]);
    const cssTriplets = [
      ...linearTokens.matchAll(
        /--linear-app-sidebar-background-rgb:\s*([^;]+);/g
      ),
    ].map(match => parseTriplet(match[1]));
    const cssTriplet = cssTriplets[cssTriplets.length - 1] ?? null;
    const sources = {
      'DESIGN.md Noir Ion table': noirTriplet,
      'DESIGN.md Sidebar table (dark)': sidebarTriplet,
      'linear-tokens.css :root.dark': cssTriplet,
    };
    const missing = Object.entries(sources)
      .filter(([, value]) => value === null)
      .map(([label]) => label);
    if (missing.length > 0) {
      report(
        'design-md-consistency',
        'FAIL',
        `could not parse sidebar rgb triplet from: ${missing.join(', ')}`
      );
    } else {
      const distinct = new Set(Object.values(sources));
      if (distinct.size > 1) {
        const detail = Object.entries(sources)
          .map(([label, value]) => `${label}=${value}`)
          .join('; ');
        report(
          'design-md-consistency',
          'FAIL',
          `dark sidebar rgb triplets disagree: ${detail}`
        );
      } else {
        report(
          'design-md-consistency',
          'PASS',
          `dark sidebar rgb triplet consistent across DESIGN.md and linear-tokens.css (${cssTriplet})`
        );
      }
    }
  } catch (error) {
    report(
      'design-md-consistency',
      'FAIL',
      `unreadable source: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const rootPkg = readJson(repoRoot, ROOT_PACKAGE_PATH);
    const webPkg = readJson(repoRoot, WEB_PACKAGE_PATH);
    const rootScripts = rootPkg.scripts ?? {};
    const webScripts = webPkg.scripts ?? {};
    const missingRoot = ROOT_REQUIRED_SCRIPTS.filter(
      name => !rootScripts[name]
    );
    const missingWeb = WEB_REQUIRED_SCRIPTS.filter(name => !webScripts[name]);
    if (missingRoot.length > 0 || missingWeb.length > 0) {
      report(
        'package-scripts',
        'FAIL',
        `missing scripts: ${[
          ...missingRoot.map(name => `${ROOT_PACKAGE_PATH} ${name}`),
          ...missingWeb.map(name => `${WEB_PACKAGE_PATH} ${name}`),
        ].join(', ')}`
      );
    } else {
      report(
        'package-scripts',
        'PASS',
        `${ROOT_PACKAGE_PATH} has ${ROOT_REQUIRED_SCRIPTS.join(', ')}; ${WEB_PACKAGE_PATH} has ${WEB_REQUIRED_SCRIPTS.join(', ')}`
      );
    }
  } catch (error) {
    report(
      'package-scripts',
      'FAIL',
      `unreadable package.json: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const lanes = readRepoFile(CI_FAST_LANES_PATH);
    const missing = CI_FAST_REQUIRED_COMMANDS.filter(
      command => !lanes.includes(command)
    );
    if (missing.length > 0) {
      report(
        'enforcement-wiring',
        'WARN',
        `${CI_FAST_LANES_PATH} does not run: ${missing.join(', ')} (weekly + local ratchet; not a ci-fast merge gate)`
      );
    } else {
      report(
        'enforcement-wiring',
        'PASS',
        `${CI_FAST_LANES_PATH} runs ${CI_FAST_REQUIRED_COMMANDS.join(', ')}`
      );
    }
    if (!lanes.includes('lint:eslint')) {
      report(
        'enforcement-wiring-eslint',
        'WARN',
        `${CI_FAST_LANES_PATH} does not run lint:eslint yet (blocking lane pending; eslint backlog is out of scope for this audit)`
      );
    } else {
      report(
        'enforcement-wiring-eslint',
        'PASS',
        `${CI_FAST_LANES_PATH} runs lint:eslint`
      );
    }
  } catch (error) {
    report(
      'enforcement-wiring',
      'FAIL',
      `${CI_FAST_LANES_PATH} unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const config = readRepoFile(ESLINT_CONFIG_PATH);
    const rulesDoc = readRepoFile(CODE_STYLE_RULES_PATH);
    const configured = new Set(
      [...config.matchAll(/'@jovie\/([a-z0-9-]+)'\s*:/g)].map(match => match[1])
    );
    const claimed = rulesDoc.match(/(\d+)\s+custom rules?/i);
    if (!claimed) {
      report(
        'eslint-rule-count',
        'FAIL',
        `${CODE_STYLE_RULES_PATH} does not state a custom-rule count to verify`
      );
    } else if (Number(claimed[1]) !== configured.size) {
      report(
        'eslint-rule-count',
        'FAIL',
        `${CODE_STYLE_RULES_PATH} claims ${claimed[1]} custom rules but ${ESLINT_CONFIG_PATH} configures ${configured.size}`
      );
    } else {
      report(
        'eslint-rule-count',
        'PASS',
        `${CODE_STYLE_RULES_PATH} claim (${claimed[1]}) matches ${ESLINT_CONFIG_PATH} (${configured.size} rules)`
      );
    }
  } catch (error) {
    report(
      'eslint-rule-count',
      'FAIL',
      `unreadable source: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const doc = readRepoFile(DESIGN_COMPLETE_PATH);
    if (/superseded/i.test(doc)) {
      report(
        'design-complete-banner',
        'PASS',
        `${DESIGN_COMPLETE_PATH} carries a superseded banner`
      );
    } else {
      report(
        'design-complete-banner',
        'FAIL',
        `${DESIGN_COMPLETE_PATH} has no superseded banner; stale completion claims contradict live tests`
      );
    }
  } catch (error) {
    report(
      'design-complete-banner',
      'FAIL',
      `${DESIGN_COMPLETE_PATH} unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const contract = readDesignAgentContract(repoRoot);
    const manifestViolations = findDesignInvariantProjectionViolations(
      readRepoFile(LLM_DESIGN_MANIFEST_PATH),
      contract
    );
    const probeContract = {
      ...contract,
      invariants: [...contract.invariants, DESIGN_PROJECTION_PROBE],
    };
    const generatedProbe = buildLlmsDesignManifest({
      repoRoot,
      designAgentContract: probeContract,
    });
    const generatorBindingViolations = findDesignInvariantProjectionViolations(
      generatedProbe,
      probeContract
    );
    const guardDetectsProbe = findDesignManifestProjectionViolations(
      repoRoot,
      probeContract
    ).some(detail => detail.includes('projection differs from JOV-INV-019'));
    const bindingViolations = [
      ...generatorBindingViolations.map(
        detail => `generator ignored contract probe: ${detail}`
      ),
      ...(guardDetectsProbe
        ? []
        : ['authority guard did not reject a changed contract projection']),
    ];
    const violations = [...manifestViolations, ...bindingViolations];
    if (violations.length > 0) {
      report(
        'design-invariant-projection',
        'FAIL',
        `design invariants must project only from canon/invariants.jsonl: ${violations.join('; ')}`
      );
    } else {
      report(
        'design-invariant-projection',
        'PASS',
        `${contract.invariants.length} design invariants project from JOV-INV-019 through executable generator and guard bindings`
      );
    }
  } catch (error) {
    report(
      'design-invariant-projection',
      'FAIL',
      `canonical projection unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const lanes = readRepoFile(CI_FAST_LANES_PATH);
    const wired = lanes.includes(SHARED_UI_VISUAL_ARBITRARY_CHECK);
    report(
      'shared-ui-visual-arbitrary-wiring',
      wired ? 'PASS' : 'FAIL',
      wired
        ? `${CI_FAST_LANES_PATH} runs ${SHARED_UI_VISUAL_ARBITRARY_CHECK}`
        : `${CI_FAST_LANES_PATH} must run ${SHARED_UI_VISUAL_ARBITRARY_CHECK} in hosted structural CI`
    );
    const audit = evaluateSharedUiVisualArbitraryAudit({
      repoRoot,
      eventName: 'local',
    });
    report(
      'shared-ui-visual-arbitrary',
      audit.ok ? 'PASS' : 'FAIL',
      audit.ok
        ? `${audit.totalFindings} visual findings across ${audit.scannedFiles.length} production files match the shrink-only baseline`
        : audit.issues.join('; ')
    );
  } catch (error) {
    report(
      'shared-ui-visual-arbitrary',
      'FAIL',
      `shared-UI visual arbitrary audit unreadable: ${error instanceof Error ? error.message : error}`
    );
  }

  const failed = results.filter(result => result.status === 'FAIL');
  const warned = results.filter(result => result.status === 'WARN');
  return { results, failed, warned };
}

function main() {
  const { results, failed, warned } = runDesignGovernanceAudit();
  console.log('Design governance audit');
  for (const result of results) {
    console.log(`  [${result.status}] ${result.id}: ${result.detail}`);
  }
  if (failed.length > 0) {
    console.error(
      `Design governance audit FAILED: ${failed.length} check(s) failing, ${warned.length} warning(s). See docs/design-system/GOVERNANCE.md.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Design governance audit passed (${results.length - warned.length - failed.length} passed, ${warned.length} warning(s)).`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
