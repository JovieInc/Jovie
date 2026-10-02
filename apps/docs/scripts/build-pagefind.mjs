#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const docsRoot = join(import.meta.dirname, '..');
const serverDir = join(docsRoot, '.next', 'server');
const stageDir = join(docsRoot, '.next', 'pagefind-site');
const outputDir = join(docsRoot, 'public', '_pagefind');

// Next 16 stores app prerenders at
// `.next/server/route-cache/<kind>/<hash>/$$<pathname>.html`.
// Older builds wrote `.next/server/app/**/*.html`. Pagefind's default site
// directory is the old path, which is empty on the current builder.
export function stagedHtmlRelativePath(serverRelativePosix) {
  const normalized = serverRelativePosix.split('\\').join('/');
  const marker = '/$$/';
  const markerAt = normalized.indexOf(marker);
  const relativePath =
    markerAt === -1
      ? normalized.startsWith('app/') && normalized.endsWith('.html')
        ? normalized.slice('app/'.length)
        : null
      : normalized.slice(markerAt + marker.length);
  if (!relativePath || relativePath.split('/').includes('..')) return null;
  if (!relativePath.endsWith('.html')) return null;
  return relativePath;
}

function htmlFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

function stageHtml() {
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  const staged = [];
  for (const directory of ['app', 'route-cache']) {
    for (const file of htmlFiles(join(serverDir, directory))) {
      const serverRelative = relative(serverDir, file);
      const stagedRelative = stagedHtmlRelativePath(serverRelative);
      if (!stagedRelative) continue;
      const destination = join(stageDir, stagedRelative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(file, destination);
      staged.push(stagedRelative);
    }
  }
  return staged;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const staged = stageHtml();
  if (staged.length === 0) {
    process.stderr.write(
      'pagefind: no prerendered HTML under .next/server/route-cache or .next/server/app\n'
    );
    process.exit(1);
  }
  const result = spawnSync(
    'pagefind',
    ['--site', stageDir, '--output-path', outputDir],
    { cwd: docsRoot, stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
}
