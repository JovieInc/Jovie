/**
 * Inventory of `scripts/` test files versus the CI entry points that run them.
 *
 * Script tests rot silently when no CI command names them: the file stays
 * green locally, main stays green, and the contract it pins drifts (see the
 * orphaned `ci-cache-policy.test.mjs`, whose cache steps were lost in the
 * #16891 merge while CI never ran the test). This module computes which
 * `scripts/**` test files a CI entry point executes so a guard test can fail
 * the moment a new orphan appears.
 *
 * CI entry points, in the order they are followed:
 *   1. `scripts/ci-fast-lanes.mjs` source (every ci-fast lane command).
 *   2. `run:` blocks of `.github/workflows/*.yml` and `.github/actions/**`.
 *   3. Root `package.json` scripts reachable from 1-2 via `pnpm <name>` /
 *      `pnpm run <name>`, followed transitively. Unreached scripts do not count.
 *   4. `node scripts/run-affected-tests.mjs --control`, when reached, expands
 *      to its fixed control-suite commands. The path-selected affected runner
 *      is not a gating entry point, so its per-change manifests do not count.
 *
 * A test counts as run when a command names it by repo path, by a glob that
 * matches it, or by a `scripts/`-relative path inside a scripts-root Vitest
 * command (`--root scripts` or `--config scripts/vitest.config.mts`).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const SCRIPT_TEST_PATTERN = /\.test\.(?:mjs|ts)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'fixtures', '.cache']);
const TEST_TOKEN =
  /(?:^|[\s'"`=(])((?:\.\/)?[\w@.*+/-]+\.test\.(?:mjs|ts))(?=$|[\s'"`;)&|,\\])/gu;
const SCRIPTS_VITEST_CONTEXT =
  /--root[= ]scripts\b|scripts\/vitest\.config\.mts|--config[= ]scripts\//u;
const PNPM_SCRIPT_REF =
  /\bpnpm\s+(?:(?:-w|--workspace-root)\s+)?(?:run\s+)?([A-Za-z][\w:.-]*)/gu;
const CONTROL_RUNNER = /run-affected-tests\.mjs\s+--control\b/u;

/**
 * Test files CI does not run on purpose. Each entry needs a reason a reviewer
 * can check; an entry that becomes wired or disappears fails the guard.
 * @type {Readonly<Record<string, string>>}
 */
export const RUNNER_ONLY_EXCEPTIONS = Object.freeze({});

/**
 * Orphans found red on main when the guard landed. They are recorded debt,
 * not skips: CI never ran them before the guard either. Each entry names the
 * observed failure; fix the drift, wire the file into a ci-fast lane, then
 * delete the entry (the guard fails while a listed file is already wired).
 * @type {Readonly<Record<string, string>>}
 */
export const KNOWN_RED_ORPHANS = Object.freeze({
  'scripts/backlog-orchestrator/__tests__/symphony-launcher.test.mjs':
    'red on main: 7 of 11 launcher subprocess cases exit non-zero (24s file).',
  'scripts/generate-llms-design-manifest.test.mjs':
    'red on main: "--check detects drift" reports no drift.',
  'scripts/repo-hygiene-guard.test.mjs':
    'red on main: 3 cleanup --apply cases no longer remove the fixture caches/packs.',
  'scripts/summer-commissioning/architecture-freshness.test.mjs':
    'red on main: registry.contextDocuments[1] is missing its freshness marker.',
  'scripts/summer-commissioning/capability-access.test.mjs':
    'red on main: registry.capabilities[4] claims autonomousSafe without its prior gates.',
  'scripts/voice-stack-bake-off/bake-off.test.mjs':
    'red on main: validate-test-script.ts imports zod, which scripts/ cannot resolve.',
  'scripts/lib/__tests__/ci-schedule-inventory.test.mjs':
    'red on main: two cron workflows lack a clock-class; fixed separately in #18430.',
  'scripts/lib/__tests__/component-shadcn-outcome-inventory.test.mjs':
    'red on main: composition inventory expects 4 entries, finds 6.',
  'scripts/lib/__tests__/pr-preparation-canary.test.mjs':
    'red on main: canonical queue-hold list no longer contains every expected hold.',
  'scripts/lib/__tests__/scripts-hermes-path-death.test.mjs':
    'red on main: 8 live package-path citations to the removed hermes path remain.',
  'scripts/lib/__tests__/typecheck-singleflight.test.mjs':
    'red on main: live-owner heartbeat case emits no "phase=wait" line.',
});

/**
 * @param {string} repoRoot
 * @returns {string[]} repo-relative POSIX paths of scripts/ test files
 */
export function listScriptTestFiles(repoRoot) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of readdirSync(dir)) {
      if (SKIPPED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SCRIPT_TEST_PATTERN.test(entry))
        out.push(relative(repoRoot, full).split(sep).join('/'));
    }
  };
  walk(join(repoRoot, 'scripts'));
  // Claude Code hooks gate every agent session; their contracts must run too.
  const hooksDir = join(repoRoot, '.claude/hooks');
  if (existsSync(hooksDir)) walk(hooksDir);
  return out.sort();
}

/**
 * Extract every `run:` command block from a workflow or composite action.
 * @param {string} text
 * @returns {string[]}
 */
export function extractRunBlocks(text) {
  const lines = text.split('\n');
  /** @type {string[]} */
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/u.exec(lines[index]);
    if (!match) continue;
    const keyIndent = lines[index].indexOf('run:');
    const rest = match[2].trim();
    if (rest && !/^[|>][-+]?$/u.test(rest)) {
      blocks.push(rest);
      continue;
    }
    const body = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() !== '' && line.search(/\S/u) <= keyIndent) {
        index -= 1;
        break;
      }
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

/** @param {string} dir @returns {string[]} */
function listYaml(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listYaml(full));
    else if (/\.ya?ml$/u.test(entry)) out.push(full);
  }
  return out;
}

/**
 * @typedef {{ source: string, text: string }} CiCommand
 */

/**
 * Follow `pnpm <script>` references from seed commands through root
 * package.json scripts until no new script is reached.
 * @param {CiCommand[]} seeds
 * @param {Record<string, string>} packageScripts
 * @returns {CiCommand[]}
 */
export function expandPackageScripts(seeds, packageScripts) {
  const reached = new Set();
  const queue = [...seeds];
  /** @type {CiCommand[]} */
  const out = [];
  while (queue.length > 0) {
    const command = /** @type {CiCommand} */ (queue.shift());
    for (const match of command.text.matchAll(PNPM_SCRIPT_REF)) {
      const name = match[1];
      if (reached.has(name) || !Object.hasOwn(packageScripts, name)) continue;
      reached.add(name);
      const next = {
        source: `package.json#${name}`,
        text: packageScripts[name],
      };
      out.push(next);
      queue.push(next);
    }
  }
  return out;
}

/**
 * Collect the command text of every CI entry point.
 * @param {string} repoRoot
 * @param {{ controlCommands?: () => Promise<string[]> }} [options]
 * @returns {Promise<CiCommand[]>}
 */
export async function collectCiCommands(repoRoot, options = {}) {
  /** @type {CiCommand[]} */
  const seeds = readFileSync(
    join(repoRoot, 'scripts/ci-fast-lanes.mjs'),
    'utf8'
  )
    .split('\n')
    .filter(line => !/^\s*(?:\/\/|\*)/u.test(line))
    .map(text => ({ source: 'scripts/ci-fast-lanes.mjs', text }));
  for (const file of [
    ...listYaml(join(repoRoot, '.github/workflows')),
    ...listYaml(join(repoRoot, '.github/actions')),
  ]) {
    const source = relative(repoRoot, file).split(sep).join('/');
    for (const text of extractRunBlocks(readFileSync(file, 'utf8')))
      seeds.push({ source, text });
  }
  const packageScripts =
    JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ??
    {};
  const commands = [...seeds, ...expandPackageScripts(seeds, packageScripts)];
  if (commands.some(command => CONTROL_RUNNER.test(command.text))) {
    const loadControl =
      options.controlCommands ??
      (async () => {
        const runner = await import('../run-affected-tests.mjs');
        return runner
          .buildControlCoverageCommands()
          .map(([bin, args]) => [bin, ...args].join(' '));
      });
    for (const text of await loadControl())
      commands.push({ source: 'run-affected-tests.mjs --control', text });
  }
  return commands;
}

/** @param {string} glob */
function globToRegExp(glob) {
  const escaped = glob
    .split('**')
    .map(part =>
      part
        .split('*')
        .map(piece => piece.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[^/]*')
    )
    .join('.*');
  return new RegExp(`^${escaped}$`, 'u');
}

/**
 * Map each test file to the CI sources that run it.
 * @param {CiCommand[]} commands
 * @param {string[]} files
 * @returns {Map<string, Set<string>>}
 */
export function mapTestReferences(commands, files) {
  const known = new Set(files);
  /** @type {Map<string, Set<string>>} */
  const refs = new Map(files.map(file => [file, new Set()]));
  /** @param {string} file @param {string} source */
  const add = (file, source) => {
    if (known.has(file)) refs.get(file)?.add(source);
  };
  for (const command of commands) {
    const scriptsRoot = SCRIPTS_VITEST_CONTEXT.test(command.text);
    for (const match of command.text.matchAll(TEST_TOKEN)) {
      const token = match[1].replace(/^\.\//u, '');
      const candidates = [token];
      if (scriptsRoot && !token.startsWith('scripts/'))
        candidates.push(`scripts/${token}`);
      for (const candidate of candidates) {
        if (candidate.includes('*')) {
          const pattern = globToRegExp(candidate);
          for (const file of files)
            if (pattern.test(file)) add(file, command.source);
        } else add(candidate, command.source);
      }
    }
  }
  return refs;
}

/**
 * @param {string} repoRoot
 * @param {{ files?: string[], commands?: CiCommand[] }} [input]
 */
export async function inventoryScriptTests(repoRoot, input = {}) {
  const files = input.files ?? listScriptTestFiles(repoRoot);
  const commands = input.commands ?? (await collectCiCommands(repoRoot));
  const refs = mapTestReferences(commands, files);
  const unrun = files.filter(file => (refs.get(file)?.size ?? 0) === 0);
  return { files, refs, unrun };
}
