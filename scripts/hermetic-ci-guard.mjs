#!/usr/bin/env node
/**
 * node scripts/hermetic-ci-guard.mjs [--check]   fail on new hermetic-CI debt
 * node scripts/hermetic-ci-guard.mjs --write     lower the ratchet to today's counts (never raises it)
 * node scripts/hermetic-ci-guard.mjs --bootstrap grandfather every current site (only while no ratchet exists)
 *
 * The hermetic CI contract (.claude/rules/hermetic-ci.md): a required check
 * gives the same verdict for the same commit whatever the day, the network,
 * the runner image or the test order. Each invariant has a rule here; the
 * wall clock has its own guard (scripts/wall-clock-test-guard.mjs).
 *
 *   network       a test calls a live host
 *   unpinned      a workflow uses a floating action ref or installs a floating tool
 *   runner-image  a job runs on a floating runner image (`*-latest`)
 *   runner-tools  a job runs a toolchain it never provisioned
 *   shared-state  a test writes a fixed /tmp path, or a runner turns isolation off
 *   seeds         a test draws unseeded randomness
 *
 * Existing sites are grandfathered per rule and file in
 * scripts/lib/hermetic-ci-guard.ratchet.json and only shrink. No dependencies:
 * the same file runs in JovieInc/Jovie and JovieInc/summer-config.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { language, stripComments } from './wall-clock-test-guard.mjs';

export const RATCHET_PATH = 'scripts/lib/hermetic-ci-guard.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.hermetic-ci-guard-ratchet/v1';

const count = (text, pattern) => (text.match(pattern) ?? []).length;

// ---------------------------------------------------------------- network
// A literal URL whose host is not loopback or a reserved test name.
const LIVE_URL =
  '[\'"`]https?:\\/\\/(?!localhost\\b|127\\.0\\.0\\.1\\b|0\\.0\\.0\\.0\\b|\\[::1\\]|[^/\'"`\\s]*\\.(?:test|invalid|example|localhost)\\b|example\\.(?:com|org|net)\\b|\\$\\{)';
const JS_LIVE_CALL = new RegExp(
  `\\b(?:fetch|axios(?:\\.(?:get|post|put|patch|delete|head|request))?|got(?:\\.(?:get|post|put|patch|delete|head))?|https?\\.(?:get|request))\\(\\s*${LIVE_URL}`,
  'gu'
);
const PY_LIVE_CALL = new RegExp(
  `\\b(?:(?:requests|httpx)\\.(?:get|post|put|patch|delete|head|request)|urlopen)\\(\\s*f?${LIVE_URL}`,
  'gu'
);
const JS_NETWORK_CONTROL =
  /\bstubGlobal\(\s*['"]fetch['"]|\bspyOn\(\s*(?:globalThis|global|window)\s*,\s*['"]fetch['"]|\bmock\.method\(\s*(?:globalThis|global)\s*,\s*['"]fetch['"]|\b(?:globalThis|global|window)\.fetch\s*=[^=]|\bfetch\s*=\s*(?:vi|jest)\.fn|\b(?:vi|jest)\.mock\(|\bnock\(|\bsetupServer\(|\bfetchMock\b|\.route\(/u;
const PY_NETWORK_CONTROL =
  /\bpatch(?:\.object)?\(|\bmonkeypatch\b|\bresponses\.|\brespx\b|\brequests_mock\b|\bhttpretty\b|\bvcr\b/u;

/** Live network calls in a test that never replaces the transport. */
export function networkIn(text, lang = 'js') {
  const [call, control] =
    lang === 'py'
      ? [PY_LIVE_CALL, PY_NETWORK_CONTROL]
      : [JS_LIVE_CALL, JS_NETWORK_CONTROL];
  if (count(text, call) === 0) return 0;
  const code = stripComments(text, lang);
  return control.test(code) ? 0 : count(code, call);
}

// ------------------------------------------------------------------ seeds
const JS_RANDOM = /\bMath\.random\(\s*\)/gu;
const JS_RANDOM_CONTROL =
  /\bspyOn\(\s*(?:globalThis\.|global\.)?Math\b|\bMath\.random\s*=[^=]|\bstubGlobal\(\s*['"]Math['"]|\bseedrandom\b/u;
const PY_RANDOM =
  /\brandom\.(?:random|randint|randrange|choice|choices|shuffle|sample|uniform|gauss)\(/gu;
const PY_RANDOM_CONTROL =
  /\brandom\.seed\(\s*\S|\brandom\.Random\(\s*[^)\s]|\bpatch(?:\.object)?\([^)\n]*random/u;

/** Unseeded random draws in a test. */
export function seedsIn(text, lang = 'js') {
  const [draw, control] =
    lang === 'py'
      ? [PY_RANDOM, PY_RANDOM_CONTROL]
      : [JS_RANDOM, JS_RANDOM_CONTROL];
  if (count(text, draw) === 0) return 0;
  const code = stripComments(text, lang);
  return control.test(code) ? 0 : count(code, draw);
}

// ----------------------------------------------------------- shared state
// A fixed path under the shared temp root: two tests, two shards on one
// self-hosted runner or two retries collide on it. mkdtemp paths are unique.
const FIXED_TMP = /['"`]\/tmp\/[\w.-]/gu;
// Runner settings that let one test file see another's module state.
const ISOLATION_OFF =
  /--test-isolation=none\b|--no-isolate\b|--isolate=false\b|\bisolate:\s*false\b|\bshuffle:\s*true\b/gu;
const RUNNER_CONFIG =
  /(?:^|\/)(?:(?:vitest|jest|playwright)[\w.-]*\.config\.[cm]?[jt]s|package\.json|pytest\.ini|pyproject\.toml|conftest\.py)$|^scripts\/ci-fast-lanes\.mjs$/u;

/** Fixed shared temp paths in a test. */
export function sharedStateIn(text, lang = 'js') {
  if (count(text, FIXED_TMP) === 0) return 0;
  return count(stripComments(text, lang), FIXED_TMP);
}

/** Isolation-off switches in a runner config, a package script or a workflow. */
export function isolationOffIn(text) {
  return count(text, ISOLATION_OFF);
}

// -------------------------------------------------------------- workflows
const WORKFLOW =
  /^\.github\/(?:workflows\/[^/]+\.ya?ml|actions\/.+\/action\.ya?ml)$/u;

/** Drop YAML comments; a `#` inside a quoted string is kept. */
export function stripYamlComments(text) {
  return text
    .split('\n')
    .map(line => {
      let quote = '';
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '#' && (i === 0 || /\s/u.test(line[i - 1])))
          return line.slice(0, i).trimEnd();
      }
      return line;
    })
    .join('\n');
}

const USES = /^\s*-?\s*uses:\s*['"]?([^\s'"]+)/gmu;
const PINNED_USE =
  /^(?:\.\.?\/|docker:\/\/[^@]+@sha256:[0-9a-f]{64}$)|@[0-9a-f]{40}$/u;
const FLOATING_INSTALL = [
  // A floating tag on anything fetched at job time.
  /[\w/.-]@latest\b|[\w/.-]:latest\b/gu,
  // Fetch-and-run without a version.
  /\b(?:pnpm dlx|bunx|yarn dlx|npx (?:-y|--yes))\s+(?!-)(?:@[\w.-]+\/)?[\w.-]+(?![\w.-]*@)(?=\s|$)/gmu,
  // A global install without a version.
  /\b(?:npm (?:install|i) (?:-g|--global)|pnpm add (?:-g|--global))\s+(?!-)(?:@[\w.-]+\/)?[\w.-]+(?![\w.-]*@)(?=\s|$)/gmu,
  // pip without hash pinning.
  /\bpip3? install\b(?![^\n]*--require-hashes)[^\n]*/gu,
  // Pipe a download into a shell.
  /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/gu,
  // System packages resolve to whatever the mirror serves that day.
  /\b(?:apt-get|apt|brew|choco)\s+install\b/gu,
];

/** Floating action refs and floating tool installs in a workflow or action. */
export function unpinnedIn(text) {
  const yaml = stripYamlComments(text);
  let n = 0;
  for (const [, ref] of yaml.matchAll(USES)) if (!PINNED_USE.test(ref)) n += 1;
  for (const pattern of FLOATING_INSTALL) n += count(yaml, pattern);
  return n;
}

/** Jobs on a floating runner image. */
export function runnerImageIn(text) {
  return count(
    stripYamlComments(text),
    /^\s*(?:runs-on:|-)\s*.*(?<![\w-])(?:ubuntu|macos|windows)-latest(?![\w.-])/gmu
  );
}

// A toolchain a job runs, and the step that provisions a pinned version of it.
// The runner image also ships these, at whatever version it has that week.
const TOOLCHAINS = [
  {
    name: 'go',
    used: /(?:^|[\s;&|(])go (?:build|test|run|install|vet|mod|generate)\b|run-actionlint\.sh/mu,
    provided: /actions\/setup-go@/u,
  },
  {
    name: 'python',
    used: /(?:^|[\s;&|(])(?:python3?(?:\.\d+)?|pip3?|pytest)\s/mu,
    provided: /actions\/setup-python@|astral-sh\/setup-uv@/u,
  },
  {
    name: 'node',
    used: /(?:^|[\s;&|(])(?:node|npm|npx|pnpm|yarn|bun)\s/mu,
    provided:
      /actions\/setup-node@|\.github\/actions\/(?:setup-node-pnpm|prime-node-toolcache)\b|oven-sh\/setup-bun@/u,
  },
  {
    // Linters and scanners whose findings change with their version: never
    // from the image, always from a pinned, checksum-verified install.
    name: 'image-linter',
    used: /(?:^|[\s;&|(])(?:shellcheck|actionlint|yamllint|hadolint|gitleaks|trufflehog|semgrep|yq)\s/mu,
    provided: /(?!)/u,
  },
];

/** Split a workflow into its jobs (keys two spaces under `jobs:`). */
export function jobsIn(yaml) {
  const lines = yaml.split('\n');
  const start = lines.findIndex(line => /^jobs:\s*$/u.test(line));
  if (start === -1) return [yaml];
  const jobs = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break;
    if (/^ {2}[\w.-]+:\s*$/u.test(line)) {
      current = [];
      jobs.push(current);
    }
    current?.push(line);
  }
  return jobs.map(job => job.join('\n'));
}

/** (job, toolchain) pairs where a job runs a toolchain it never provisions. */
export function runnerToolsIn(text) {
  let n = 0;
  for (const job of jobsIn(stripYamlComments(text))) {
    // Only the commands a job runs count, not names, paths or conditions.
    const commands = job
      .split('\n')
      .filter(
        line => !/^\s*-?\s*(?:name|uses|if|id|key|path|with):/u.test(line)
      )
      .join('\n');
    for (const tool of TOOLCHAINS)
      if (tool.used.test(commands) && !tool.provided.test(job)) n += 1;
  }
  return n;
}

// ------------------------------------------------------------------ rules
export const RULES = Object.freeze({
  network: {
    what: 'a test calls a live host',
    fix: "Replace the transport in the test (vi.stubGlobal('fetch', ...), vi.mock, msw, page.route, unittest.mock.patch, responses) or point it at a loopback server the test starts. A live host makes the verdict depend on someone else's uptime.",
    count: (path, text) => {
      const lang = language(path);
      return lang ? networkIn(text, lang) : 0;
    },
  },
  unpinned: {
    what: 'a workflow uses a floating action ref or installs a floating tool',
    fix: 'Pin actions to a full 40-character commit SHA (keep the tag in a trailing comment). Install tools at an exact version with a checksum: a lockfile install, pip --require-hashes, or a sha256-verified download. No @latest, no curl | sh, no apt/brew install in a gate.',
    count: (path, text) => (WORKFLOW.test(path) ? unpinnedIn(text) : 0),
  },
  'runner-image': {
    what: 'a job runs on a floating runner image',
    fix: 'Name the image (ubuntu-24.04, macos-15), never *-latest: the label moves to a new OS without a commit.',
    count: (path, text) => (WORKFLOW.test(path) ? runnerImageIn(text) : 0),
  },
  'runner-tools': {
    what: 'a job runs a toolchain it never provisioned',
    fix: 'Provision the toolchain in the same job at a pinned version (actions/setup-node or ./.github/actions/setup-node-pnpm, actions/setup-python, actions/setup-go). Linters and scanners (shellcheck, actionlint, gitleaks, yq, ...) come from a pinned, checksum-verified install by absolute path, never from the runner image.',
    count: (path, text) => (WORKFLOW.test(path) ? runnerToolsIn(text) : 0),
  },
  'shared-state': {
    what: 'a test writes a fixed /tmp path, or a runner turns isolation off',
    fix: 'Give each test its own directory (mkdtemp, tmp_path) and keep per-file isolation on in the runner. State shared between tests makes the verdict depend on order, shard and retry.',
    count: (path, text) => {
      const lang = language(path);
      if (lang) return sharedStateIn(text, lang);
      return RUNNER_CONFIG.test(path) || WORKFLOW.test(path)
        ? isolationOffIn(text)
        : 0;
    },
  },
  seeds: {
    what: 'a test draws unseeded randomness',
    fix: 'Seed it or replace it: vi.spyOn(Math, "random"), a seeded generator passed into the code under test, random.Random(1234) in Python. Print the seed when a property test needs many.',
    count: (path, text) => {
      const lang = language(path);
      return lang ? seedsIn(text, lang) : 0;
    },
  },
});

const SKIPPED = /(?:^|\/)(?:node_modules|\.agents|\.claude\/skills)\//u;
const SCANNED = path =>
  !SKIPPED.test(path) &&
  (language(path) !== null || WORKFLOW.test(path) || RUNNER_CONFIG.test(path));

/** @returns {Record<string, Record<string, number>>} rule -> file -> count */
export function scan(root, files) {
  const counts = Object.fromEntries(Object.keys(RULES).map(rule => [rule, {}]));
  for (const file of files) {
    if (!SCANNED(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const [rule, { count: countRule }] of Object.entries(RULES)) {
      const n = countRule(file, text);
      if (n) counts[rule][file] = n;
    }
  }
  return counts;
}

export function violations(counts, ratchet) {
  const bad = [];
  for (const rule of Object.keys(RULES))
    for (const [file, n] of Object.entries(counts[rule] ?? {})) {
      const allowed = ratchet[rule]?.[file] ?? 0;
      if (n > allowed) bad.push({ rule, file, found: n, allowed });
    }
  return bad;
}

export function tighten(counts, ratchet) {
  const next = {};
  for (const rule of Object.keys(RULES)) {
    const kept = {};
    for (const [file, allowed] of Object.entries(ratchet[rule] ?? {})) {
      const n = counts[rule]?.[file] ?? 0;
      if (n > 0) kept[file] = Math.min(allowed, n);
    }
    next[rule] = Object.fromEntries(Object.entries(kept).sort());
  }
  return next;
}

function root() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

function trackedFiles(cwd) {
  const out = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }
  );
  return [...new Set(out.stdout.split('\0').filter(Boolean))];
}

export function main(argv = process.argv.slice(2)) {
  const cwd = root();
  const path = join(cwd, RATCHET_PATH);
  const counts = scan(cwd, trackedFiles(cwd));
  const sorted = byRule =>
    Object.fromEntries(
      Object.keys(RULES).map(rule => [
        rule,
        Object.fromEntries(Object.entries(byRule[rule] ?? {}).sort()),
      ])
    );
  const save = entries =>
    writeFileSync(
      path,
      `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
    );
  if (argv.includes('--bootstrap')) {
    if (existsSync(path)) {
      console.error(
        'hermetic-ci-guard: ratchet exists; use --write to tighten it'
      );
      return 1;
    }
    save(sorted(counts));
    return 0;
  }
  const ratchet = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).entries
    : {};
  if (argv.includes('--write')) {
    save(tighten(counts, ratchet));
    return 0;
  }
  const bad = violations(counts, ratchet);
  if (bad.length) {
    console.error(
      'hermetic-ci-guard: new hermetic-CI debt (.claude/rules/hermetic-ci.md):'
    );
    for (const rule of Object.keys(RULES)) {
      const mine = bad.filter(v => v.rule === rule);
      if (!mine.length) continue;
      console.error(`\n[${rule}] ${RULES[rule].what}`);
      for (const v of mine)
        console.error(`  ${v.file}: ${v.found} found, ${v.allowed} allowed`);
      console.error(`  Fix: ${RULES[rule].fix}`);
    }
    return 1;
  }
  const slack = Object.keys(RULES).reduce(
    (total, rule) =>
      total +
      Object.entries(ratchet[rule] ?? {}).filter(
        ([file, n]) => (counts[rule]?.[file] ?? 0) < n
      ).length,
    0
  );
  if (slack)
    console.log(
      `hermetic-ci-guard: ok; ${slack} grandfathered entr${slack === 1 ? 'y' : 'ies'} can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
