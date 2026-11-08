#!/usr/bin/env node
// One implementation per product surface (canon/ENGINEERING.md, "One surface
// per product"). Fails when an apps/* directory is unregistered, an
// 'independent' app has no justification, a forbidden parallel implementation
// (for example native Ovie or the JovieInc/ovie repo) is tracked, or a
// registry still lists a forbidden repository.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SURFACES_SCHEMA = 'jovie-product-surfaces/v1';
const KINDS = new Set(['shell', 'deploy-boundary', 'wrapper', 'independent']);

export function validateSurfaces({
  registry,
  appDirs,
  trackedFiles,
  readFile,
}) {
  const problems = [];
  if (registry.schema !== SURFACES_SCHEMA) {
    problems.push(`schema must be ${SURFACES_SCHEMA}`);
  }
  const apps = registry.apps ?? {};
  for (const dir of appDirs) {
    const entry = apps[dir];
    if (!entry) {
      problems.push(
        `${dir} is not registered in canon/product-surfaces.json: extend the existing product shell, or register it with kind "independent" and a justification`
      );
      continue;
    }
    if (!KINDS.has(entry.kind)) {
      problems.push(`${dir}: kind must be one of ${[...KINDS].join(', ')}`);
    }
    if (entry.kind === 'independent' && !entry.justification) {
      problems.push(`${dir}: independent apps need a justification`);
    }
  }
  for (const dir of Object.keys(apps)) {
    if (!appDirs.includes(dir)) {
      problems.push(`${dir} is registered but no longer exists; remove it`);
    }
  }
  for (const [name, product] of Object.entries(registry.products ?? {})) {
    for (const pattern of product.forbiddenTrackedPaths ?? []) {
      const re = new RegExp(pattern);
      const hit = trackedFiles.find(file => re.test(file));
      if (hit) {
        problems.push(
          `${name}: parallel implementation tracked at ${hit} (matches ${pattern}); extend ${product.shell} instead`
        );
      }
    }
    for (const repo of product.forbiddenRepos ?? []) {
      for (const file of registry.registryFiles ?? []) {
        const text = readFile(file);
        if (text && text.toLowerCase().includes(repo.toLowerCase())) {
          problems.push(`${file} still lists retired repository ${repo}`);
        }
      }
    }
  }
  return problems;
}

function main() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const registry = JSON.parse(
    readFileSync(join(root, 'canon/product-surfaces.json'), 'utf8')
  );
  const appDirs = readdirSync(join(root, 'apps'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `apps/${entry.name}`)
    .filter(dir =>
      execFileSync('git', ['ls-files', '--', dir], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    );
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
  const problems = validateSurfaces({
    registry,
    appDirs,
    trackedFiles,
    readFile: file =>
      existsSync(join(root, file))
        ? readFileSync(join(root, file), 'utf8')
        : '',
  });
  if (problems.length) {
    console.error(problems.map(p => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('product surfaces: ok');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
