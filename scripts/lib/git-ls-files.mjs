import { execFileSync } from 'node:child_process';

/**
 * Every tracked path. The repo's path list is past Node's 1 MiB execFileSync
 * default, so whole-repo reads need a larger buffer or they throw ENOBUFS.
 */
export function gitLsFiles(cwd = process.cwd()) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}
