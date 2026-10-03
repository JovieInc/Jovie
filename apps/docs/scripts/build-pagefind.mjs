#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const docsRoot = join(import.meta.dirname, '..');
const nextDir = join(docsRoot, '.next');
const serverDir = join(nextDir, 'server');
const stageDir = join(nextDir, 'pagefind-site');
const outputDir = join(docsRoot, 'public', '_pagefind');
const FALLBACK_SUFFIX = '.prerender-fallback.html';

// Next 16 stores app prerenders at
// `.next/server/route-cache/<kind>/<hash>/$$<pathname>.html`
// or, without an adapter, `.next/server/app/**/*.html`.
// Vercel's adapter copies the same HTML to
// `.next/output/functions/<pathname>.prerender-fallback.html` during
// onBuildComplete, which runs before this postbuild.
export function stagedHtmlRelativePath(serverRelativePosix) {
  const normalized = serverRelativePosix.split('\\').join('/');
  const marker = '/$$/';
  const markerAt = normalized.indexOf(marker);
  let relativePath = null;
  if (normalized.endsWith(FALLBACK_SUFFIX)) {
    const functionsAt = normalized.lastIndexOf('output/functions/');
    const fromFunctions =
      functionsAt === -1
        ? normalized
        : normalized.slice(functionsAt + 'output/functions/'.length);
    relativePath = `${fromFunctions.slice(0, -FALLBACK_SUFFIX.length)}.html`;
  } else if (markerAt !== -1) {
    relativePath = normalized.slice(markerAt + marker.length);
  } else if (normalized.endsWith('.html')) {
    const appMarker = normalized.startsWith('app/')
      ? 'app/'
      : normalized.includes('/server/app/')
        ? '/server/app/'
        : null;
    if (appMarker) {
      relativePath = normalized.slice(
        normalized.indexOf(appMarker) + appMarker.length
      );
    }
  }
  if (relativePath === null) {
    const staticMarker = 'output/static/';
    const staticAt = normalized.indexOf(staticMarker);
    if (
      staticAt !== -1 &&
      normalized.endsWith('.html') &&
      !normalized.includes('/_next/')
    ) {
      relativePath = normalized.slice(staticAt + staticMarker.length);
    }
  }
  if (!relativePath || relativePath.split('/').includes('..')) return null;
  if (!relativePath.endsWith('.html')) return null;
  if (relativePath.includes('.segments/')) return null;
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
  const seen = new Set();
  const directories = [
    join(serverDir, 'app'),
    join(serverDir, 'route-cache'),
    join(nextDir, 'output', 'functions'),
    join(nextDir, 'output', 'static'),
  ];
  for (const directory of directories) {
    for (const file of htmlFiles(directory)) {
      const stagedRelative = stagedHtmlRelativePath(relative(docsRoot, file));
      if (!stagedRelative || seen.has(stagedRelative)) continue;
      seen.add(stagedRelative);
      const destination = join(stageDir, stagedRelative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(file, destination);
      staged.push(stagedRelative);
    }
  }
  return staged;
}

function sampleHtml(directory, limit) {
  const found = [];
  const walk = current => {
    if (found.length >= limit || !existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (found.length >= limit) return;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html') || entry.name.endsWith('.body')) {
        found.push(relative(docsRoot, path));
      }
    }
  };
  walk(directory);
  return found;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const staged = stageHtml();
  if (staged.length === 0) {
    const sample = sampleHtml(nextDir, 20);
    writeSync(
      2,
      'pagefind: no prerendered HTML under .next/server or .next/output\n'
    );
    if (sample.length > 0) {
      writeSync(
        2,
        `pagefind: html present but unmapped:\n${sample.join('\n')}\n`
      );
    }
    process.exit(1);
  }
  const result = spawnSync(
    'pagefind',
    ['--site', stageDir, '--output-path', outputDir],
    { cwd: docsRoot, stdio: 'inherit' }
  );
  if (result.error) writeSync(2, `${result.error.message}\n`);
  process.exit(result.status ?? 1);
}
