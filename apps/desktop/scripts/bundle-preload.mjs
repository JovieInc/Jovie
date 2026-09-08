#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function bundleDesktopPreload({
  entryPoint = join(desktopRoot, 'src', 'preload.ts'),
  outfile = join(desktopRoot, 'dist-electron', 'preload.js'),
} = {}) {
  await build({
    bundle: true,
    entryPoints: [entryPoint],
    external: ['electron'],
    format: 'cjs',
    logLevel: 'info',
    outfile,
    platform: 'node',
    target: 'node22',
  });
}

function isMainModule() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return true;
  }
}

if (isMainModule()) {
  await bundleDesktopPreload();
}
