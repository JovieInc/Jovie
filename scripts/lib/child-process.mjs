// node:child_process with a 256 MiB output buffer by default.
//
// Node's sync and buffered calls cap captured output at 1 MiB. `git ls-files`
// on this repo is already past that, so any script that reads the whole tree
// throws `spawnSync git ENOBUFS` as soon as a PR adds files. Import from here
// instead of node:child_process in scripts that capture git output. A caller's
// own maxBuffer always wins; `spawn` and `exec*` streams are passed through.

import * as childProcess from 'node:child_process';

export const MAX_BUFFER = 256 * 1024 * 1024;

/** Options with maxBuffer defaulted, leaving a caller's own value alone. */
export function withMaxBuffer(options) {
  if (options && options.maxBuffer !== undefined) return options;
  return { ...options, maxBuffer: MAX_BUFFER };
}

// (file, args?, options?): args may be left out, with options second.
function argsAndOptions(args, options) {
  if (Array.isArray(args)) return [args, withMaxBuffer(options)];
  return [[], withMaxBuffer(args)];
}

export function execFileSync(file, args, options) {
  const [list, opts] = argsAndOptions(args, options);
  return childProcess.execFileSync(file, list, opts);
}

export function spawnSync(command, args, options) {
  const [list, opts] = argsAndOptions(args, options);
  return childProcess.spawnSync(command, list, opts);
}

export function execSync(command, options) {
  return childProcess.execSync(command, withMaxBuffer(options));
}

export function spawn(...args) {
  return childProcess.spawn(...args);
}
