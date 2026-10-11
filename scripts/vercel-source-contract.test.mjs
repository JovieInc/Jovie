import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

const DOCS_ROOT = 'apps/docs';
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+\.mjs)['"]/g;

function walkProductionSources(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkProductionSources(path, files);
      continue;
    }
    if (!/\.(?:mjs|ts|tsx|js|jsx)$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\./.test(entry.name)) continue;
    files.push(path);
  }
  return files;
}

function docsBuildModules() {
  const modules = new Set();
  const pkg = JSON.parse(readFileSync(join(DOCS_ROOT, 'package.json'), 'utf8'));
  for (const script of Object.values(pkg.scripts ?? {})) {
    for (const match of String(script).matchAll(/node\s+([^\s'"]+\.mjs)/g)) {
      modules.add(join(DOCS_ROOT, match[1]));
    }
  }

  for (const file of walkProductionSources(DOCS_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      if (specifier.startsWith('@/')) {
        modules.add(join(DOCS_ROOT, specifier.slice(2)));
      } else if (specifier.startsWith('.')) {
        modules.add(relative('.', resolve(dirname(file), specifier)));
      }
    }
    for (const match of source.matchAll(
      /join\(repositoryRoot,\s*'([^']+)'\)/g
    )) {
      modules.add(match[1]);
    }
  }
  return [...modules].sort();
}

function ignoredFiles(paths) {
  if (paths.length === 0) return [];
  const output = execFileSync(
    'git',
    ['ls-files', '-ci', '--exclude-from=.vercelignore', '--', ...paths],
    { encoding: 'utf8' }
  );
  return output.split('\n').filter(Boolean);
}

describe('Vercel source contract', () => {
  it('keeps the docs build config and root route in the source upload', () => {
    const ignored = execFileSync(
      'git',
      [
        'ls-files',
        '-ci',
        '--exclude-from=.vercelignore',
        'apps/docs/package.json',
        'apps/docs/next.config.mjs',
        'apps/docs/app/page.mdx',
      ],
      { encoding: 'utf8' }
    );

    assert.equal(ignored.trim(), '');
  });

  it('uploads every module and proof asset the docs build reads', () => {
    const modules = docsBuildModules();
    assert.ok(modules.includes('apps/docs/scripts/validate-articles.mjs'));
    assert.ok(modules.includes('apps/docs/scripts/materialize-proof.mjs'));
    assert.ok(modules.includes('apps/docs/lib/article-registry.mjs'));
    assert.ok(modules.includes('docs/FEATURE_REGISTRY.md'));
    assert.ok(modules.includes('apps/web/constants/routes.ts'));

    assert.deepEqual(ignoredFiles(modules), []);

    const proof = 'apps/docs/public/proof';
    assert.equal(lstatSync(proof).isSymbolicLink(), false);
    const proofFiles = readdirSync(proof)
      .filter(name => name.endsWith('.png'))
      .map(name => join(proof, name));
    assert.ok(proofFiles.length > 0);
    assert.deepEqual(ignoredFiles(proofFiles), []);

    const stillIgnored = ignoredFiles([
      'apps/docs/lib/visual-proof-assets.mjs',
      'apps/docs/lib/article-registry.test.mjs',
      'apps/docs/lib/help-center-seo.test.mjs',
      'scripts/help-center-visual-assets.mjs',
      'docs/screenshots/pitch-v1/portal-desktop.png',
    ]);
    assert.ok(stillIgnored.includes('apps/docs/lib/visual-proof-assets.mjs'));
    assert.ok(stillIgnored.includes('apps/docs/lib/article-registry.test.mjs'));
    assert.ok(stillIgnored.includes('apps/docs/lib/help-center-seo.test.mjs'));
    assert.ok(stillIgnored.includes('scripts/help-center-visual-assets.mjs'));
    assert.ok(
      stillIgnored.includes('docs/screenshots/pitch-v1/portal-desktop.png')
    );
  });

  it('does not add docs build inputs to the web runtime trace', () => {
    const tracing = readFileSync('apps/web/next.config.js', 'utf8');
    const stage = readFileSync(
      'apps/web/scripts/stage-runtime-data.mjs',
      'utf8'
    );
    for (const needle of [
      'apps/docs/lib',
      'apps/docs/scripts',
      'docs/screenshots',
    ]) {
      assert.equal(tracing.includes(needle), false, needle);
      assert.equal(stage.includes(needle), false, needle);
    }
  });

  it('pins production install to PATH pnpm so Promote cannot re-enter crashing corepack', () => {
    const root = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const web = JSON.parse(readFileSync('apps/web/vercel.json', 'utf8'));

    assert.equal(root.installCommand, 'pnpm install --frozen-lockfile');
    assert.equal(
      root.buildCommand,
      'env -u TURBO_REMOTE_ONLY pnpm turbo build --filter=@jovie/web'
    );
    assert.doesNotMatch(root.installCommand, /corepack/);
    assert.doesNotMatch(root.buildCommand, /corepack/);
    assert.equal(web.installCommand, 'pnpm install --frozen-lockfile');
    assert.equal(web.buildCommand, 'pnpm run build');
    assert.doesNotMatch(web.installCommand, /corepack/);
    assert.doesNotMatch(web.buildCommand, /corepack/);

    const docs = JSON.parse(readFileSync('apps/docs/vercel.json', 'utf8'));
    assert.doesNotMatch(docs.installCommand, /corepack/);
    assert.doesNotMatch(docs.buildCommand, /corepack/);
  });

  it('builds the docs package instead of inheriting the web project config', () => {
    const config = JSON.parse(readFileSync('apps/docs/vercel.json', 'utf8'));

    assert.equal(config.framework, 'nextjs');
    assert.equal(
      config.installCommand,
      'cd ../.. && pnpm install --frozen-lockfile'
    );
    assert.equal(config.buildCommand, 'pnpm run build');
    assert.equal(config.outputDirectory, '.next');
    // The current native Vercel policy builds release branches and skips PRs.
    for (const { branch, status } of [
      { branch: 'main', status: 1 },
      { branch: 'production', status: 1 },
      { branch: 'codex/test', status: 0 },
    ]) {
      const result = spawnSync('bash', ['-c', config.ignoreCommand], {
        env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch },
        encoding: 'utf8',
      });
      assert.equal(result.status, status, result.stderr);
    }
    assert.doesNotMatch(config.buildCommand, /@jovie\/web/);
  });
});
