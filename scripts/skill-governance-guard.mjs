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
];

const REQUIRED_OVERLAY_PHRASES = [
  '### Jovie Overrides for Installed Vercel Skills',
  'use TanStack Query',
  'Route application calls through `apps/web/lib/ai/sdk.ts`',
  'boolean-prop guidance as an API-design heuristic',
  'inline hydration scripts or `suppressHydrationWarning`',
];

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

export function evaluateSkillGovernance({ root = process.cwd() } = {}) {
  const errors = [];
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
