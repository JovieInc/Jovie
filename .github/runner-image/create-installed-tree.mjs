#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const archiveRoot = resolve(process.argv[3] ?? '/opt/jovie-installed-tree');

function sha256File(path) {
  for (const [command, args] of [
    ['sha256sum', [path]],
    ['shasum', ['-a', '256', path]],
  ]) {
    try {
      return execFileSync(command, args, { encoding: 'utf8' })
        .trim()
        .split(/\s+/)[0];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Neither sha256sum nor shasum is available.');
}

const lockSha = sha256File(resolve(repoRoot, 'pnpm-lock.yaml'));
const archivePath = resolve(archiveRoot, `${lockSha}.tar`);
const temporaryArchivePath = `${archivePath}.tmp`;
const listPath = `${archivePath}.files`;

function assertContainedSymlinks(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(path);
    const resolvedTarget = resolve(dirname(path), target);
    const targetRelative = relative(repoRoot, resolvedTarget);
    if (
      isAbsolute(target) ||
      targetRelative === '..' ||
      targetRelative.startsWith(
        `..${process.platform === 'win32' ? '\\' : '/'}`
      )
    ) {
      throw new Error(
        `Installed-tree symlink escapes the repo: ${path} -> ${target}`
      );
    }
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) {
    assertContainedSymlinks(resolve(path, entry));
  }
}

function installedTreeRoots() {
  const roots = ['node_modules'];
  for (const scope of ['apps', 'packages', 'workers']) {
    for (const entry of readdirSync(resolve(repoRoot, scope), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const candidate = resolve(repoRoot, scope, entry.name, 'node_modules');
      try {
        if (lstatSync(candidate).isDirectory()) {
          roots.push(relative(repoRoot, candidate));
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return roots.sort();
}

mkdirSync(archiveRoot, { recursive: true });
const roots = installedTreeRoots();
for (const root of roots) {
  assertContainedSymlinks(resolve(repoRoot, root));
}
writeFileSync(listPath, `${roots.join('\0')}\0`);

try {
  execFileSync(
    'tar',
    [
      '--create',
      '--file',
      temporaryArchivePath,
      '--format=gnu',
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--null',
      '--files-from',
      listPath,
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  renameSync(temporaryArchivePath, archivePath);
  const archiveSha = sha256File(archivePath);
  writeFileSync(`${archivePath}.sha256`, `${archiveSha}  ${archivePath}\n`);
  process.stdout.write(`${archivePath}\n`);
} finally {
  rmSync(temporaryArchivePath, { force: true });
  rmSync(listPath, { force: true });
}
