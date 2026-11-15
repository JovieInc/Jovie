// node:child_process with a 256 MiB output buffer by default.
//
// Node's sync and buffered calls cap captured output at 1 MiB. `git ls-files`
// on this repo is already past that, so any script that reads the whole tree
// throws `spawnSync git ENOBUFS` as soon as a PR adds files. Import from here
// instead of node:child_process in scripts that capture git output. A caller's
// own maxBuffer always wins; `spawn` and `exec*` streams are passed through.

import * as childProcess from 'node:child_process';

export const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Options with maxBuffer defaulted, leaving a caller's own value alone.
 * @param {any} options
 * @returns {any}
 */
export function withMaxBuffer(options) {
  if (options && options.maxBuffer !== undefined) return options;
  return { ...options, maxBuffer: MAX_BUFFER };
}

// (file, args?, options?): args may be left out, with options second.
/** @param {any} args @param {any} options @returns {[readonly string[], any]} */
function argsAndOptions(args, options) {
  if (Array.isArray(args)) return [args, withMaxBuffer(options)];
  return [[], withMaxBuffer(args)];
}

// Each export keeps node's own overloaded type, so callers typecheck exactly
// as they did against node:child_process.

/** @type {typeof childProcess.execFileSync} */
export const execFileSync = /** @type {any} */ (
  /** @param {string} file @param {any} [args] @param {any} [options] */
  (file, args, options) => {
    const [list, opts] = argsAndOptions(args, options);
    return childProcess.execFileSync(file, list, opts);
  }
);

/** @type {typeof childProcess.spawnSync} */
export const spawnSync = /** @type {any} */ (
  /** @param {string} command @param {any} [args] @param {any} [options] */
  (command, args, options) => {
    const [list, opts] = argsAndOptions(args, options);
    return childProcess.spawnSync(command, list, opts);
  }
);

/** @type {typeof childProcess.execSync} */
export const execSync = /** @type {any} */ (
  /** @param {string} command @param {any} [options] */
  (command, options) => childProcess.execSync(command, withMaxBuffer(options))
);

export const spawn = childProcess.spawn;
