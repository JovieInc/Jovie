#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
/**
 * Resolve changed files for merge_group Path Changes (JOV-4905).
 *
 * Event base_sha...head_sha is the first range (JOV-4446 — never read
 * push/PR-only event fields). A coalesced or re-resolved group can make that
 * range empty even when the combined head still differs from live main.
 * Recompute against the live refs/heads/main merge-base before classifying a
 * typed no-op. A valid head never hard-fails on an empty event-base diff.
 *
 * Idempotency: pathchanges-coalesce-2026-08-09
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const ZERO_SHA = '0'.repeat(40);
export const LIVE_MAIN_FETCH_REF = 'refs/heads/main:refs/remotes/origin/main';
export const LIVE_MAIN_REF = 'refs/remotes/origin/main';

export class MergeGroupPathDiffError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeGroupPathDiffError';
  }
}

/** @typedef {{ status: number, stdout: string, stderr: string }} GitResult */
/** @typedef {(args: string[], options?: { allowFailure?: boolean }) => GitResult} GitRunner */
/**
 * @typedef {{
 *   files: string[],
 *   source: 'event_base' | 'live_main_merge_base' | 'noop',
 *   isNoop: boolean,
 *   baseSha: string | null,
 *   headSha: string,
 *   notice?: string,
 * }} MergeGroupPathDiff
 */

/**
 * @param {string | undefined} value
 * @param {string} field
 * @returns {string}
 */
export function requireExactSha(value, field) {
  const sha = String(value ?? '');
  if (!SHA_PATTERN.test(sha) || sha === ZERO_SHA) {
    throw new MergeGroupPathDiffError(`${field} is not a usable exact SHA`);
  }
  return sha;
}

/**
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseChangedFiles(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * @param {string} cwd
 * @returns {GitRunner}
 */
export function createGitRunner(cwd) {
  return (args, { allowFailure = false } = {}) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.error) {
      throw result.error;
    }
    const status = result.status ?? 1;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    if (status !== 0 && !allowFailure) {
      throw new MergeGroupPathDiffError(
        `git ${args.join(' ')} failed: ${stderr.trim() || stdout.trim()}`
      );
    }
    return { status, stdout, stderr };
  };
}

/**
 * @param {GitRunner} git
 * @param {string} baseSha
 * @param {string} headSha
 * @returns {{ ok: boolean, files: string[] }}
 */
export function diffNameOnlyThreeDot(git, baseSha, headSha) {
  const mergeBase = git(['merge-base', baseSha, headSha], {
    allowFailure: true,
  });
  if (mergeBase.status !== 0) {
    return { ok: false, files: [] };
  }
  const diff = git(['diff', '--name-only', `${baseSha}...${headSha}`], {
    allowFailure: true,
  });
  if (diff.status !== 0) {
    return { ok: false, files: [] };
  }
  return { ok: true, files: parseChangedFiles(diff.stdout) };
}

/**
 * @param {object} options
 * @param {GitRunner} options.git
 * @param {string} options.headSha
 * @param {string} [options.liveMainRef]
 * @param {boolean} [options.fetchLiveMain]
 * @returns {{ files: string[], mergeBase: string | null, notice?: string }}
 */
export function resolveLiveMainChangedFiles({
  git,
  headSha,
  liveMainRef = LIVE_MAIN_REF,
  fetchLiveMain = true,
}) {
  if (fetchLiveMain) {
    const fetched = git(['fetch', '--no-tags', 'origin', LIVE_MAIN_FETCH_REF], {
      allowFailure: true,
    });
    if (fetched.status !== 0) {
      return {
        files: [],
        mergeBase: null,
        notice:
          'Live refs/heads/main was unavailable after an empty merge_group event-base diff; continuing as an explicit no-op combined head.',
      };
    }
  }

  const verified = git(['rev-parse', '--verify', liveMainRef], {
    allowFailure: true,
  });
  if (verified.status !== 0) {
    return {
      files: [],
      mergeBase: null,
      notice:
        'Live origin/main is not a usable ref after an empty merge_group event-base diff; continuing as an explicit no-op combined head.',
    };
  }
  const liveMainSha = verified.stdout.trim();
  const mergeBase = git(['merge-base', headSha, liveMainSha], {
    allowFailure: true,
  });
  if (mergeBase.status !== 0) {
    return {
      files: [],
      mergeBase: null,
      notice:
        'No merge-base with live origin/main after an empty merge_group event-base diff; continuing as an explicit no-op combined head.',
    };
  }
  const mergeBaseSha = mergeBase.stdout.trim();
  const liveDiff = diffNameOnlyThreeDot(git, mergeBaseSha, headSha);
  if (!liveDiff.ok) {
    return {
      files: [],
      mergeBase: mergeBaseSha,
      notice:
        'Live-main merge-base diff failed after an empty merge_group event-base diff; continuing as an explicit no-op combined head.',
    };
  }
  return { files: liveDiff.files, mergeBase: mergeBaseSha };
}

/**
 * @param {object} options
 * @param {GitRunner} options.git
 * @param {string} options.eventBaseSha
 * @param {string} options.eventHeadSha
 * @param {string} [options.liveMainRef]
 * @param {boolean} [options.fetchLiveMain]
 * @returns {MergeGroupPathDiff}
 */
export function resolveMergeGroupPathDiff({
  git,
  eventBaseSha,
  eventHeadSha,
  liveMainRef = LIVE_MAIN_REF,
  fetchLiveMain = true,
}) {
  const headSha = requireExactSha(eventHeadSha, 'merge_group.head_sha');
  const eventBase = requireExactSha(eventBaseSha, 'merge_group.base_sha');

  const headCommit = git(['cat-file', '-e', `${headSha}^{commit}`], {
    allowFailure: true,
  });
  const headTree = git(['cat-file', '-e', `${headSha}^{tree}`], {
    allowFailure: true,
  });
  if (headCommit.status !== 0 || headTree.status !== 0) {
    throw new MergeGroupPathDiffError(
      `merge_group head ${headSha} is not a valid tree`
    );
  }

  const eventDiff = diffNameOnlyThreeDot(git, eventBase, headSha);
  if (eventDiff.ok && eventDiff.files.length > 0) {
    return {
      files: eventDiff.files,
      source: 'event_base',
      isNoop: false,
      baseSha: eventBase,
      headSha,
    };
  }

  const live = resolveLiveMainChangedFiles({
    git,
    headSha,
    liveMainRef,
    fetchLiveMain,
  });
  if (live.files.length > 0) {
    return {
      files: live.files,
      source: 'live_main_merge_base',
      isNoop: false,
      baseSha: live.mergeBase,
      headSha,
    };
  }

  return {
    files: [],
    source: 'noop',
    isNoop: true,
    baseSha: live.mergeBase ?? eventBase,
    headSha,
    notice:
      live.notice ??
      `No tree changes vs merge_group base ${eventBase} or live main merge-base; continuing as an explicit no-op combined head.`,
  };
}

/**
 * @param {MergeGroupPathDiff} result
 * @returns {string}
 */
export function formatMetaEnv(result) {
  return [
    `IS_NOOP=${result.isNoop ? 'true' : 'false'}`,
    `SOURCE=${result.source}`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--skip-fetch') {
      parsed.skipFetch = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new MergeGroupPathDiffError(`unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new MergeGroupPathDiffError(`missing value for --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const cwd = typeof args.cwd === 'string' ? args.cwd : process.cwd();
  const result = resolveMergeGroupPathDiff({
    git: createGitRunner(cwd),
    eventBaseSha: String(args.base ?? ''),
    eventHeadSha: String(args.head ?? ''),
    fetchLiveMain: args.skipFetch !== true,
  });

  if (typeof args['files-out'] === 'string') {
    writeFileSync(
      args['files-out'],
      result.files.length > 0 ? `${result.files.join('\n')}\n` : ''
    );
  } else {
    process.stdout.write(
      result.files.length > 0 ? `${result.files.join('\n')}\n` : ''
    );
  }

  if (typeof args['meta-out'] === 'string') {
    writeFileSync(args['meta-out'], formatMetaEnv(result));
  }

  if (result.notice) {
    process.stderr.write(`::notice::${result.notice}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}
