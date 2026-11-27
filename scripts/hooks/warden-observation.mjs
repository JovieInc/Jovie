#!/usr/bin/env node
// Local advisory observer. The event feed is the receipt store, not a second ledger.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  computeStageTimings,
  parseStageEventFeed,
} from '../lib/stage-events.mjs';
import { parseReviewResult, RESULT_FORMAT } from './warden-result.mjs';
import { reviewBase } from './warden-triage.mjs';

const here = import.meta.dirname;
export const WARDEN_VERSION = '0.54.0';
const version = WARDEN_VERSION;
export const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const read = file => {
  try {
    return readFileSync(file);
  } catch {
    return null;
  }
};
function git(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('git input identity unavailable');
  return result.stdout;
}
export function executable(name) {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    const file = join(dir, name);
    const result = spawnSync('test', ['-x', file]);
    if (result.status === 0) return file;
  }
  return null;
}

export function inputIdentity(mode, env = process.env) {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  let head = null;
  try {
    head = git(['rev-parse', '--verify', 'HEAD'], root).trim();
  } catch {
    /* unborn index */
  }
  const comparisonRef = mode === 'staged' ? null : reviewBase();
  const comparisonHead = comparisonRef
    ? git(['rev-parse', comparisonRef], root).trim()
    : null;
  const base =
    mode === 'staged'
      ? head
      : git(['merge-base', comparisonRef, 'HEAD'], root).trim();
  const stagedTree =
    mode === 'staged' ? git(['write-tree'], root).trim() : null;
  const diff = git(
    mode === 'staged'
      ? ['diff', '--cached', '--binary', '--no-ext-diff', '--no-renames']
      : ['diff', '--binary', '--no-ext-diff', '--no-renames', `${base}...HEAD`],
    root
  );
  // Warden can read the worktree in addition to the index. Hash the whole
  // non-ignored context conservatively; no dependency-aware reuse is claimed.
  const paths = git(
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    root
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const context = [];
  for (const path of [...new Set(paths)]) {
    const file = join(root, path);
    try {
      const stat = lstatSync(file);
      context.push([
        path,
        stat.mode,
        stat.isSymbolicLink()
          ? digest([
              readlinkSync(file),
              statSync(file).isDirectory() &&
              realpathSync(file).startsWith(`${root}/`)
                ? 'in-repository-directory'
                : hash(readFileSync(file)),
            ])
          : stat.isFile()
            ? hash(readFileSync(file))
            : 'directory',
      ]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      context.push([path, 'missing']);
    }
  }
  const policyFiles = [
    'warden.toml',
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    'canon/OPERATING_SYSTEM.md',
  ];
  const policyDigest = digest([
    ...policyFiles.map(path => [path, hash(read(join(root, path)) ?? '')]),
    ...[
      'warden-local-review.mjs',
      'warden-observation.mjs',
      'warden-local-review.sh',
      'warden-triage.mjs',
      'warden-result.mjs',
    ].map(path => [path, hash(read(join(here, path)) ?? '')]),
    {
      triage: env.WARDEN_TRIAGE ?? 'on',
      push: env.WARDEN_PUSH_REVIEW ?? 'off',
      local: env.WARDEN_LOCAL_REVIEW ?? 'warn',
      timeout: env.WARDEN_TIMEOUT_SECONDS ?? '180',
    },
  ]);
  const cli = executable('warden');
  const modelConfigDigest = digest({
    environment: Object.entries(env)
      .filter(
        ([key]) =>
          /^(WARDEN_|PI_)/.test(key) &&
          !/(KEY|TOKEN|SECRET|PASSWORD|OBSERVATION_DIR)/.test(key)
      )
      .sort(),
    config: hash(read(join(root, 'warden.toml')) ?? ''),
    models: hash(read(join(here, 'warden-pi-models.json')) ?? ''),
    cli: cli ? [cli, hash(read(cli) ?? '')] : `npm:@sentry/warden@${version}`,
  });
  const identity = {
    mode,
    repositoryDigest: hash(root),
    branch: git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root).trim(),
    base,
    head,
    stagedTree,
    comparisonRef,
    comparisonHead,
    serviceTokenPresent: Boolean(env.WARDEN_SERVICE_TOKEN),
    diffDigest: hash(diff),
    contextDigest: digest(context),
    policyDigest,
    modelConfigDigest,
  };
  return { ...identity, inputDigest: digest(identity) };
}

export function storage(env) {
  return (
    env.WARDEN_OBSERVATION_DIR ||
    join(env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'jovie-warden')
  );
}
export function emit(dir, event) {
  // Recording must never change advisory/strict semantics, even on full disks.
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'stage-events.ndjson');
    appendFileSync(file, `${JSON.stringify(event)}\n`);
    const manifest = JSON.parse(
      readFileSync(
        resolve(here, '../../docs/metrics/stage-manifest.json'),
        'utf8'
      )
    );
    const { events, rejected } = parseStageEventFeed(
      readFileSync(file, 'utf8'),
      manifest
    );
    const timings = computeStageTimings(events, manifest, {
      sources: { 'local-review-events': { ok: true, rejected } },
    });
    const observations = events.map(row => row.observation).filter(Boolean);
    timings.localReview = {
      n: observations.length,
      outcomes: Object.fromEntries(
        [...new Set(observations.map(row => row.outcome))].map(outcome => [
          outcome,
          observations.filter(row => row.outcome === outcome).length,
        ])
      ),
      completedReviews: observations.filter(row => row.reviewCompleted).length,
      reusedReviews: observations.filter(row => row.reusedFrom).length,
      missing: Object.fromEntries(
        [
          'knownCostUsd',
          'runtimeReportedCostUsd',
          'requestedModelsWithUsage',
          'modelActuallyAttempted',
          'findingCount',
          'resultProof',
        ].map(key => [key, observations.filter(row => row[key] == null).length])
      ),
    };
    writeFileSync(
      join(dir, 'stage-timings-latest.json'),
      `${JSON.stringify(timings)}\n`
    );
  } catch {
    /* telemetry I/O is best effort */
  }
}

export function configuredSkills() {
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    return [];
  }
  const config = read(join(root, 'warden.toml'))?.toString() ?? '';
  // Only the current simple local built-in skill entries qualify. Remote skill
  // revisions/ambient config have no complete identity, so do not reuse them.
  if (/remote\s*=|extends\s*=/.test(config)) return [];
  const names = [
    ...config.matchAll(/\[\[skills\]\]\s*\nname\s*=\s*"([^"]+)"/g),
  ].map(match => match[1]);
  return names.every(name => ['security-review', 'code-review'].includes(name))
    ? names
    : [];
}
export function reusePolicy(skills, env = process.env) {
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const config = read(join(root, 'warden.toml'))?.toString() ?? '';
  if (
    env.WARDEN_SERVICE_URL ||
    env.WARDEN_SERVICE_TOKEN ||
    env.WARDEN_SERVICE_MEMORY ||
    /^\s*\[service\]/m.test(config)
  )
    return {
      allowed: false,
      reason: 'External Warden service memory is outside the input identity',
    };
  // PATH launchers can import mutable dist files and bundled skill policy; the
  // launcher's own bytes do not bind that package tree. No version probe runs.
  if (executable('warden'))
    return {
      allowed: false,
      reason:
        'PATH Warden package and built-in policy identity are unbound; reuse disabled',
    };
  for (const skill of skills)
    for (const directory of [
      '.warden/skills',
      '.agents/skills',
      '.claude/skills',
    ])
      for (const suffix of ['', '.md']) {
        try {
          lstatSync(join(root, directory, `${skill}${suffix}`));
          return {
            allowed: false,
            reason:
              'Local skill override is outside the supported built-in policy identity',
          };
        } catch (error) {
          if (error.code !== 'ENOENT')
            return {
              allowed: false,
              reason: 'Local skill policy could not be inspected',
            };
        }
      }
  return { allowed: true, reason: null };
}

export function priorResult(dir, identity, skills) {
  try {
    const rows = readFileSync(join(dir, 'stage-events.ndjson'), 'utf8')
      .trim()
      .split('\n');
    for (const line of rows.reverse()) {
      let row;
      try {
        row = JSON.parse(line).observation;
      } catch {
        continue;
      }
      if (
        row?.inputDigest !== identity.inputDigest ||
        !row.reuseEligible ||
        !row.identityComplete ||
        row.outcome !== 'completed' ||
        row.resultProof?.format !== RESULT_FORMAT ||
        hash(row.resultProof.output) !== row.resultProof.digest
      )
        continue;
      const proof = parseReviewResult(row.resultProof.output, skills);
      if (proof?.complete) return row;
    }
  } catch {
    /* unreadable/corrupt history is a cache miss */
  }
  return null;
}
