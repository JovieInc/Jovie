#!/usr/bin/env node

import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTERNAL_NEXT_PREFIX = 'apps/web/.next/';

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile() && entry.name === '.vc-config.json') {
      yield path;
    }
  }
}

function assertSafeBuildPath(path) {
  if (!path.startsWith(EXTERNAL_NEXT_PREFIX)) return false;
  if (path.includes('\0') || path.split('/').includes('..')) {
    throw new Error(`Unsafe Vercel build dependency path: ${path}`);
  }
  return true;
}

export async function collectVercelArtifactClosure(repoRoot) {
  const functionsDir = resolve(repoRoot, '.vercel/output/functions');
  const paths = new Set();

  for await (const configPath of walk(functionsDir)) {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    for (const path of Object.keys(config.filePathMap ?? {})) {
      if (assertSafeBuildPath(path)) paths.add(path);
    }
  }

  return [...paths].sort();
}

export async function verifyVercelArtifactClosure(repoRoot) {
  const paths = await collectVercelArtifactClosure(repoRoot);
  const missing = [];

  for (const path of paths) {
    const absolutePath = resolve(repoRoot, path);
    try {
      await lstat(absolutePath);
      // stat follows symlinks, so this also rejects a present-but-dangling entry.
      await stat(absolutePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missing.push(path);
    }
  }

  return { missing, paths };
}

async function main() {
  const [command = 'verify', rootArg = process.cwd()] = process.argv.slice(2);
  const repoRoot = resolve(rootArg);

  if (command === 'list-null') {
    const paths = await collectVercelArtifactClosure(repoRoot);
    process.stdout.write(paths.map(path => `${path}\0`).join(''));
    return;
  }

  if (command !== 'verify') {
    throw new Error(`Unknown command: ${command}`);
  }

  const { missing, paths } = await verifyVercelArtifactClosure(repoRoot);
  if (missing.length > 0) {
    const preview = missing.slice(0, 10).join(', ');
    console.error(
      `::error title=Vercel artifact dependency closure missing::${missing.length} generated runtime path(s) are missing or dangling before deploy: ${preview}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Verified Vercel artifact dependency closure: ${paths.length} path(s)`
  );
}

const isEntryPoint =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isEntryPoint) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
