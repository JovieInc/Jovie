#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Path segments that host adapters dump duplicate SKILL.md into. */
export const ADAPTER_SKILL_SEGMENTS = Object.freeze([
  '.bak',
  '.cursor',
  '.factory',
]);

/** Checkout guts — never catalog these as skills. */
export const NON_SKILL_SEGMENTS = Object.freeze(['src', 'test', 'bin']);

export const APPROVED_VERCEL_SKILLS = Object.freeze({
  'ai-sdk': Object.freeze({
    ref: 'baee8388b935746407dd7091b2403b66c979a6d7',
    skillPath: 'skills/use-ai-sdk/SKILL.md',
    source: 'vercel-labs/ai',
  }),
  'vercel-composition-patterns': Object.freeze({
    ref: 'f8a72b9603728bb92a217a879b7e62e43ad76c81',
    skillPath: 'skills/composition-patterns/SKILL.md',
    source: 'vercel-labs/agent-skills',
  }),
  'vercel-react-best-practices': Object.freeze({
    ref: 'f8a72b9603728bb92a217a879b7e62e43ad76c81',
    skillPath: 'skills/react-best-practices/SKILL.md',
    source: 'vercel-labs/agent-skills',
  }),
});

const REQUIRED_FIND_SKILL_PHRASES = [
  'DISABLE_TELEMETRY=1 DO_NOT_TRACK=1',
  '--owner <owner>',
  '--skill <exact-skill> --agent claude-code codex -y',
  'Never use `--global` or `-g`',
  'Treat `npx skills check` and `npx skills update` as',
  'Do not use `npx skills add <source> --help`',
  'vercel-cli-with-tokens',
  'deploy-to-vercel',
  'react-native-skills',
  'react-view-transitions',
  'writing-guidelines',
  'Observability Plus',
  'docs/agent-context/vercel-agent-skills-coverage.md',
];

const REQUIRED_OVERLAY_PHRASES = [
  '### Jovie Overrides for Installed Vercel Skills',
  'use TanStack Query',
  'Route application calls through `apps/web/lib/ai/sdk.ts`',
  'boolean-prop guidance as an API-design heuristic',
  'inline hydration scripts or `suppressHydrationWarning`',
  'docs/agent-context/vercel-agent-skills-coverage.md',
  'Observability Plus',
  'vercel-cli-with-tokens',
];

export const DENIED_VERCEL_SKILLS = Object.freeze([
  'vercel-cli-with-tokens',
  'deploy-to-vercel',
  'react-native-skills',
  'vercel-react-native-skills',
  'react-view-transitions',
  'vercel-react-view-transitions',
  'writing-guidelines',
  'web-design-guidelines',
  'vercel-optimize',
]);

const COVERAGE_MAP_PATH = 'docs/agent-context/vercel-agent-skills-coverage.md';
const VERCEL_LABS_PINS_PATH = 'docs/vendor/vercel-labs/pins.json';
const WEB_INTERFACE_GAPS_PATH =
  '.agents/skills/gstack/design-review/references/web-interface-gaps.md';

const REQUIRED_COVERAGE_MAP_PHRASES = [
  'JOV-6188',
  'vercel-cli-with-tokens',
  'deploy-to-vercel',
  'react-native-skills',
  'react-view-transitions',
  'writing-guidelines',
  'Observability Plus',
  'Tim-gated',
  'vercel-react-best-practices',
  'vercel-composition-patterns',
  'PUBLIC_SKILL_REGISTRY',
];

const REQUIRED_HANDBOOK_PINS = [
  'vercel-labs/web-interface-guidelines',
  'vercel-labs/writing-guidelines',
];

const IMPORT_HAZARD_PATTERNS = [
  {
    id: 'swr-import',
    re: /\bfrom\s+['"]swr(?:\/[^'"]*)?['"]|\bfrom\s+['"]@vercel\/swr['"]|\buseSWR(?:Mutation|Subscription)?\b/,
    message: 'imported skill must not introduce SWR; Jovie uses TanStack Query',
  },
  {
    id: 'printenv-token',
    re: /printenv\s+VERCEL_TOKEN|grep\s+['"]?VERCEL_TOKEN|grep\s+.*\.env.*VERCEL_TOKEN|VERCEL_TOKEN=\$\(printenv/,
    message: 'imported skill must not printenv/grep VERCEL_TOKEN from .env',
  },
  {
    id: 'skip-url-verify',
    re: /skip(?:ping)?\s+(?:deployment\s+)?URL\s+verif|do not verify (?:the )?(?:deployment )?URL|bypass(?:es)? (?:deployment )?URL verif/i,
    message: 'imported skill must not bypass deployment URL verification',
  },
  {
    id: 'enable-observability-plus',
    re: /Enable Observability Plus|enable Observability Plus|Observability Plus.{0,40}(?:turn on|enable|upgrade|paid)/i,
    message:
      'imported skill must not enable Observability Plus or paid Vercel products',
  },
  {
    id: 'override-design-rules',
    re: /(?:override|supersede|replace)\s+(?:DESIGN\.md|design-canonical|Jovie design)/i,
    message: 'imported skill must not override Jovie design rules',
  },
  {
    id: 'expand-task-scope',
    re: /Implement \*\*all\*\* applicable patterns|do not ask which issues to fix/i,
    message:
      'imported skill must not expand task scope beyond the assigned candidate',
  },
];

const RUNTIME_MAIN_FETCH =
  /raw\.githubusercontent\.com\/vercel-labs\/(?:web-interface-guidelines|writing-guidelines)\/main\/command\.md/;

const REQUIRED_EXECUTED_SKILL_OVERLAYS = Object.freeze({
  'ai-sdk': [
    '## Jovie Repository Override',
    '`apps/web/package.json`',
    'Do not install or upgrade `ai`',
    '`apps/web/lib/ai/sdk.ts`',
  ],
  'vercel-react-best-practices': [
    '## Jovie Repository Override',
    'use TanStack Query',
    'Do not introduce SWR',
    'Do not add inline hydration scripts',
    '`suppressHydrationWarning`',
  ],
});

export function collectAdapterSkillMarkdown(root) {
  const hits = [];
  for (const resolverRoot of ['.claude/skills', '.agents/skills']) {
    walkSkillTree(resolve(root, resolverRoot), resolverRoot, hits);
  }
  return hits;
}

function walkSkillTree(absolute, relative, hits) {
  if (!existsSync(absolute)) return;
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return;
  }
  const parts = relative.split(/[/\\]/);
  const underAdapter = ADAPTER_SKILL_SEGMENTS.some(segment =>
    parts.includes(segment)
  );
  const underCheckoutGuts = NON_SKILL_SEGMENTS.some(segment =>
    parts.includes(segment)
  );
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const childAbsolute = resolve(absolute, entry.name);
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      walkSkillTree(childAbsolute, childRelative, hits);
      continue;
    }
    if (
      (underAdapter || underCheckoutGuts) &&
      /^SKILL\.md$/i.test(entry.name)
    ) {
      hits.push(childRelative);
    }
  }
}

function readText(root, path, errors) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: required file is missing`);
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

export function computeSkillFolderHash(skillDir) {
  const files = [];

  function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        collect(absolutePath);
      } else {
        files.push({
          absolutePath,
          relativePath: relative(skillDir, absolutePath).split(sep).join('/'),
        });
      }
    }
  }

  collect(skillDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(readFileSync(file.absolutePath));
  }
  return hash.digest('hex');
}

function validateSkillDirectory(
  root,
  name,
  expectedHash,
  errors,
  resolverRoots
) {
  for (const resolverRoot of resolverRoots) {
    const relativePath = `${resolverRoot}/${name}`;
    const absolutePath = resolve(root, relativePath);
    if (!existsSync(resolve(absolutePath, 'SKILL.md'))) {
      errors.push(`${relativePath}/SKILL.md: required file is missing`);
      continue;
    }
    const actualHash = computeSkillFolderHash(absolutePath);
    if (actualHash !== expectedHash) {
      errors.push(
        `${relativePath}: computedHash does not match installed content (expected ${expectedHash}, got ${actualHash})`
      );
    }
  }
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function walkRepoFiles(absolute, hits) {
  if (!existsSync(absolute)) return;
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      walkRepoFiles(child, hits);
      continue;
    }
    hits.push(child);
  }
}

function assertDeniedSkillInventory(root, lock, errors) {
  const listed = new Set([
    ...Object.keys(lock.skills ?? {}),
    ...(lock.ownedSkills ?? []),
    ...(lock.codexSkills ?? []),
  ]);
  for (const name of DENIED_VERCEL_SKILLS) {
    if (listed.has(name)) {
      errors.push(
        `${name}: denied Vercel skill must not appear in skills-lock.json inventories`
      );
    }
    for (const resolverRoot of ['.claude/skills', '.agents/skills']) {
      if (existsSync(resolve(root, resolverRoot, name))) {
        errors.push(
          `${resolverRoot}/${name}: denied Vercel skill must not be installed`
        );
      }
    }
  }
}

function assertCoverageMap(root, errors) {
  const text = readText(root, COVERAGE_MAP_PATH, errors);
  if (!text) return;
  for (const phrase of REQUIRED_COVERAGE_MAP_PHRASES) {
    if (!text.includes(phrase)) {
      errors.push(
        `${COVERAGE_MAP_PATH}: missing required coverage phrase: ${phrase}`
      );
    }
  }
}

function assertPinnedHandbooks(root, errors) {
  const pinsText = readText(root, VERCEL_LABS_PINS_PATH, errors);
  if (!pinsText) return;
  let pins;
  try {
    pins = JSON.parse(pinsText);
  } catch (error) {
    errors.push(`${VERCEL_LABS_PINS_PATH}: invalid JSON (${error.message})`);
    return;
  }
  const handbooks = pins.handbooks ?? {};
  for (const name of REQUIRED_HANDBOOK_PINS) {
    const pin = handbooks[name];
    if (!pin?.ref || !pin.sha256 || !pin.path) {
      errors.push(
        `${VERCEL_LABS_PINS_PATH}: missing a complete pin for ${name}`
      );
      continue;
    }
    const absolute = resolve(root, pin.path);
    if (!existsSync(absolute)) {
      errors.push(`Pinned handbook ${pin.path} is missing`);
      continue;
    }
    const actual = sha256File(absolute);
    if (actual !== pin.sha256) {
      errors.push(
        `Pinned handbook ${pin.path} hash drifted. Expected ${pin.sha256}, found ${actual}`
      );
    }
  }
}

function assertDesignGapFold(root, errors) {
  const text = readText(root, WEB_INTERFACE_GAPS_PATH, errors);
  if (!text) return;
  for (const phrase of [
    'Do not invoke `web-design-guidelines`',
    '## Forms',
    '## Overflow',
    '## Media',
    '## Localization',
    '## Browser',
    '## Accessibility gaps',
  ]) {
    if (!text.includes(phrase)) {
      errors.push(
        `${WEB_INTERFACE_GAPS_PATH}: missing required fold: ${phrase}`
      );
    }
  }
}

function assertNoRuntimeMainFetches(root, errors) {
  const hits = [];
  walkRepoFiles(resolve(root, '.claude/skills'), hits);
  walkRepoFiles(resolve(root, '.agents/skills'), hits);
  for (const filePath of hits) {
    if (!/(?:SKILL\.md|SKILL\.md\.tmpl)$/.test(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    if (RUNTIME_MAIN_FETCH.test(text)) {
      errors.push(
        `${relative(root, filePath)}: must not fetch mutable vercel-labs handbook docs from main`
      );
    }
  }
}

function assertImportHazards(root, lock, errors) {
  for (const name of Object.keys(lock.skills ?? {})) {
    if (APPROVED_VERCEL_SKILLS[name]) continue;
    for (const resolverRoot of ['.claude/skills', '.agents/skills']) {
      const dir = resolve(root, resolverRoot, name);
      if (!existsSync(dir)) continue;
      const hits = [];
      walkRepoFiles(dir, hits);
      for (const filePath of hits) {
        if (!/\.(md|tmpl|ts|tsx|js|mjs)$/.test(filePath)) continue;
        const text = readFileSync(filePath, 'utf8');
        for (const hazard of IMPORT_HAZARD_PATTERNS) {
          if (hazard.re.test(text)) {
            errors.push(`${relative(root, filePath)}: ${hazard.message}`);
          }
        }
      }
    }
  }
}

export function evaluateSkillGovernance({ root = process.cwd() } = {}) {
  const errors = [];
  for (const adapterPath of collectAdapterSkillMarkdown(root)) {
    errors.push(
      `${adapterPath}: SKILL.md under .bak/.cursor/.factory or src/test/bin must not be catalog-visible`
    );
  }
  const lockText = readText(root, 'skills-lock.json', errors);
  let lock;
  try {
    lock = JSON.parse(lockText);
  } catch (error) {
    errors.push(`skills-lock.json: invalid JSON (${error.message})`);
    return errors;
  }

  if (
    lock.version !== 1 ||
    !Array.isArray(lock.codexSkills) ||
    !lock.skills ||
    typeof lock.skills !== 'object' ||
    !Array.isArray(lock.ownedSkills)
  ) {
    errors.push(
      'skills-lock.json: expected version 1 with skills, ownedSkills, and codexSkills inventories'
    );
    return errors;
  }

  const knownClaudeSkillDirectories = new Set([
    ...Object.keys(lock.skills),
    ...lock.ownedSkills,
  ]);

  function inventoryEntries(resolverRoot) {
    const absoluteRoot = resolve(root, resolverRoot);
    if (!existsSync(absoluteRoot)) return [];
    const entries = readdirSync(absoluteRoot, { withFileTypes: true }).filter(
      entry => entry.isDirectory() || entry.isSymbolicLink()
    );
    if (resolverRoot !== '.agents/skills') return entries;

    const tracked = spawnSync('git', ['ls-files', '--', `${resolverRoot}/`], {
      cwd: root,
      encoding: 'utf8',
    });
    if (tracked.status !== 0) return entries;
    const trackedNames = new Set(
      tracked.stdout
        .split('\n')
        .filter(Boolean)
        .map(path => path.split('/')[2])
    );
    return entries.filter(entry => trackedNames.has(entry.name));
  }

  for (const [resolverRoot, inventory] of [
    ['.claude/skills', knownClaudeSkillDirectories],
    ['.agents/skills', new Set(lock.codexSkills)],
  ]) {
    for (const entry of inventoryEntries(resolverRoot)) {
      if (!inventory.has(entry.name)) {
        errors.push(
          `${resolverRoot}/${entry.name}: skill directory is absent from the resolver inventory`
        );
      }
    }
  }

  if (lock.skills['find-skills']) {
    errors.push(
      'skills-lock.json: find-skills is Jovie-owned and must not be overwritten by skills update'
    );
  }

  for (const [name, entry] of Object.entries(lock.skills)) {
    if (entry.source === 'vercel-labs/openreview') {
      errors.push(`${name}: vercel-labs/openreview is not approved for Jovie`);
    }
    if (
      typeof entry.source === 'string' &&
      entry.source.startsWith('vercel-labs/') &&
      !APPROVED_VERCEL_SKILLS[name]
    ) {
      errors.push(
        `${name}: Vercel Labs skill is outside the approved allowlist`
      );
    }
    if (entry.source?.startsWith('vercel-labs/') && entry.globalInstall) {
      errors.push(`${name}: repository skills must not use globalInstall`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.computedHash ?? '')) {
      errors.push(`${name}: expected a 64-character computedHash pin`);
      continue;
    }
    const resolverRoots = ['.claude/skills'];
    if (lock.codexSkills.includes(name)) resolverRoots.push('.agents/skills');
    validateSkillDirectory(
      root,
      name,
      entry.computedHash,
      errors,
      resolverRoots
    );
  }

  for (const [name, expected] of Object.entries(APPROVED_VERCEL_SKILLS)) {
    const entry = lock.skills[name];
    if (!entry) {
      errors.push(
        `${name}: required approved skill is missing from skills-lock.json`
      );
      continue;
    }
    if (entry.source !== expected.source) {
      errors.push(
        `${name}: expected source ${expected.source}, got ${entry.source}`
      );
    }
    if (entry.skillPath !== expected.skillPath) {
      errors.push(
        `${name}: expected skillPath ${expected.skillPath}, got ${entry.skillPath}`
      );
    }
    if (entry.sourceType !== 'github') {
      errors.push(`${name}: expected sourceType github`);
    }
    if (entry.ref !== expected.ref) {
      errors.push(`${name}: expected immutable ref ${expected.ref}`);
    }
    const executedSkill = readText(
      root,
      `.claude/skills/${name}/SKILL.md`,
      errors
    );
    for (const phrase of REQUIRED_EXECUTED_SKILL_OVERLAYS[name] ?? []) {
      if (!executedSkill.includes(phrase)) {
        errors.push(
          `${name}: missing required executed-skill overlay: ${phrase}`
        );
      }
    }
  }

  const findSkill = readText(
    root,
    '.claude/skills/find-skills/SKILL.md',
    errors
  );
  for (const phrase of REQUIRED_FIND_SKILL_PHRASES) {
    if (!findSkill.includes(phrase)) {
      errors.push(`find-skills: missing required guard phrase: ${phrase}`);
    }
  }
  const codexFindSkill = readText(
    root,
    '.agents/skills/find-skills/SKILL.md',
    errors
  );
  if (codexFindSkill !== findSkill) {
    errors.push(
      'find-skills: Claude and Codex resolver copies must be byte-identical'
    );
  }

  const gstackRule = readText(root, '.claude/rules/gstack.md', errors);
  for (const phrase of REQUIRED_OVERLAY_PHRASES) {
    if (!gstackRule.includes(phrase)) {
      errors.push(`gstack.md: missing required Vercel overlay: ${phrase}`);
    }
  }

  assertDeniedSkillInventory(root, lock, errors);
  assertCoverageMap(root, errors);
  assertPinnedHandbooks(root, errors);
  assertDesignGapFold(root, errors);
  assertNoRuntimeMainFetches(root, errors);
  assertImportHazards(root, lock, errors);

  return errors;
}

function evaluateStagedSkillGovernance() {
  const temporaryRoot = mkdtempSync(
    resolve(tmpdir(), 'jovie-skill-governance-index-')
  );
  try {
    const checkout = spawnSync(
      'git',
      ['checkout-index', '--all', `--prefix=${temporaryRoot}/`],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    if (checkout.status !== 0) {
      return [
        `unable to materialize staged snapshot: ${checkout.stderr.trim() || 'git checkout-index failed'}`,
      ];
    }
    return evaluateSkillGovernance({ root: temporaryRoot });
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function main() {
  const errors = process.argv.includes('--staged')
    ? evaluateStagedSkillGovernance()
    : evaluateSkillGovernance();
  if (errors.length === 0) {
    console.log(
      `[skill-governance] clean (${Object.keys(APPROVED_VERCEL_SKILLS).length} approved Vercel skills)`
    );
    return;
  }
  console.error('[skill-governance] blocked:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) main();
