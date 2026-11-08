// Which workspace one rolling mutation sweep run targets (scripts/mutation-sweep.mjs).
//
// apps/web is the default and keeps its apps/web-relative state keys. @jovie/ui
// is selected with repo-relative patterns (`--include packages/ui/atoms/`, or
// `--files packages/ui/atoms/badge.tsx`); its modules are keyed by repo path
// (packages/ui/atoms/badge.tsx) so the component certificate can match them,
// and they run through packages/ui's own vitest via scripts/mutation-ui.mjs.
// Same-stem test inventory stays per root, so a packages/ui badge.test.tsx
// never binds an apps/web module and the reverse.

const UI = 'packages/ui';
const DEFAULT_WEB_INCLUDE = 'lib/,app/api/';

/** @typedef {{ root: string, keyPrefix: string, harness: string, includes: string[] }} SweepTarget */

/** @param {string} path */
const isUi = path => path === UI || path.startsWith(`${UI}/`);
/** @param {string | undefined} list */
const split = list => (list ?? '').split(/[\s,]+/u).filter(Boolean);

/**
 * @param {{ include?: string, files?: string }} [options] the sweep's raw
 *   --include and --files values
 * @returns {SweepTarget}
 */
export function resolveSweepRoot({ include, files } = {}) {
  const patterns = split(include);
  const explicit = split(files);
  const all = [...patterns, ...explicit];
  const ui = all.filter(isUi);
  if (ui.length === 0) {
    return {
      root: 'apps/web',
      keyPrefix: '',
      harness: 'scripts/mutation-diff.mjs',
      includes: patterns.length ? patterns : split(DEFAULT_WEB_INCLUDE),
    };
  }
  if (ui.length !== all.length) {
    throw new Error(
      '--include/--files cannot mix packages/ui with apps/web paths; sweep each root separately'
    );
  }
  return {
    root: UI,
    keyPrefix: `${UI}/`,
    harness: 'scripts/mutation-ui.mjs',
    includes: patterns.length
      ? patterns.map(pattern => pattern.slice(UI.length).replace(/^\//u, ''))
      : [''],
  };
}

/** State key for a root-relative module path. @param {SweepTarget} target @param {string} rel */
export const stateKey = (target, rel) => `${target.keyPrefix}${rel}`;

/** Root-relative path for a state key. @param {SweepTarget} target @param {string} key */
export function rootRelative(target, key) {
  if (!key.startsWith(target.keyPrefix))
    throw new Error(`${key} is not under ${target.root}`);
  return key.slice(target.keyPrefix.length);
}

/** Report file name the harness writes for a module (shared with the harness). @param {string} rel */
export const reportName = rel => `${rel.replace(/[^\w.-]+/gu, '_')}.json`;

/**
 * Arguments for the per-module harness, given a root-relative module path.
 * @param {SweepTarget} target
 * @param {string} rel
 */
export function harnessArgs(target, rel) {
  const repoPath = `${target.root}/${rel}`;
  return target.root === UI
    ? ['--files', repoPath]
    : ['--scope', 'all', '--files', repoPath, '--max-files', '1'];
}

/** Verify command for a survivor work item, given a state key. @param {string} key */
export function verifyCommand(key) {
  return isUi(key)
    ? `node scripts/mutation-ui.mjs --files ${key}`
    : `node scripts/mutation-diff.mjs --scope all --files apps/web/${key}`;
}
