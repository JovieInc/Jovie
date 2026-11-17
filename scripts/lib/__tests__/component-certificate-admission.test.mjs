import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/component-certificate.yml'),
  'utf8'
);
const fixtureRoots = [];
function fixtureRoot(prefix) {
  const root = mkdtempSync(resolve(tmpdir(), prefix));
  fixtureRoots.push(root);
  return root;
}
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Component Certificate failed-capture admission dependencies', () => {
  it('installs typescript for the failed-capture admission before it runs scripts', () => {
    // component-ship-policy.mjs (reached via component-story-receipts.mjs)
    // imports 'typescript' for story-source parsing, and the failed-capture
    // admission job runs node scripts with no workspace install. Without the
    // install step the job dies on module load (JOV-12692).
    const admission = load(workflow).jobs.failed_capture;
    const installs = admission.steps.filter(
      step => step.name === 'Install typescript only'
    );
    expect(installs).toHaveLength(1);
    expect(installs[0].run).toMatch(
      /npm install .*--ignore-scripts "typescript@\$\{version\}"/u
    );
    expect(installs[0].run).not.toMatch(/pnpm install/u);
    // The step resolves its version from the root package.json pin.
    const { devDependencies } = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')
    );
    expect(devDependencies.typescript).toEqual(expect.any(String));
    // The install must precede both node script steps it unblocks.
    for (const id of ['canonical', 'Require current capture bindings']) {
      const consumer = admission.steps.find(
        step => step.id === id || step.name === id
      );
      expect(consumer, id).toBeDefined();
      expect(admission.steps.indexOf(installs[0])).toBeLessThan(
        admission.steps.indexOf(consumer)
      );
    }
  });
  it('keeps the failed-capture admission script graph within installed deps', () => {
    // The failed-capture admission job installs ONLY typescript (no
    // workspace install), so every module reachable from
    // scripts/lib/component-story-completion.mjs must import nothing
    // beyond node: builtins and typescript. A new bare import here would
    // ERR_MODULE_NOT_FOUND in that job, not in a local workspace run —
    // this guard is the tripwire (JOV-12692). Parsed with the real
    // typescript AST so comments and string literals never count.
    const bare = new Set();
    const seen = new Set();
    const queue = [
      resolve(REPO_ROOT, 'scripts/lib/component-story-completion.mjs'),
    ];
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const queueSpecifier = (specifier, fromFile) => {
        if (specifier.startsWith('node:')) return;
        if (!specifier.startsWith('.')) {
          bare.add(specifier);
          return;
        }
        const target = resolve(fromFile, '..', specifier);
        const found = [
          target,
          `${target}.ts`,
          `${target}.mjs`,
          resolve(target, 'index.ts'),
          resolve(target, 'index.mjs'),
        ].find(candidate => existsSync(candidate));
        expect(
          found,
          `unresolved import ${specifier} in ${fromFile}`
        ).toBeDefined();
        if (found) queue.push(found);
      };
      const visit = node => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          queueSpecifier(node.moduleSpecifier.text, file);
        } else if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          queueSpecifier(node.arguments[0].text, file);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect([...bare].sort()).toEqual(['typescript']);

    // Run the real module graph outside the workspace, so installed workspace
    // dependencies cannot hide a missing admission dependency.
    const root = fixtureRoot('component-admission-deps-');
    for (const file of seen) {
      const target = resolve(root, relative(REPO_ROOT, file));
      mkdirSync(resolve(target, '..'), { recursive: true });
      cpSync(file, target);
    }
    const entry = pathToFileURL(
      resolve(root, 'scripts/lib/component-story-completion.mjs')
    ).href;
    const probe = () =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { verifiedStoryCacheKey, requireCurrentStoryCache } from ${JSON.stringify(entry)};
import { strict as assert } from 'node:assert';
assert.equal(typeof verifiedStoryCacheKey, 'function');
assert.equal(typeof requireCurrentStoryCache, 'function');`,
        ],
        { cwd: root, encoding: 'utf8' }
      );
    const missing = probe();
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("Cannot find package 'typescript'");
    mkdirSync(resolve(root, 'node_modules'));
    cpSync(
      resolve(
        createRequire(import.meta.url).resolve('typescript/package.json'),
        '..'
      ),
      resolve(root, 'node_modules/typescript'),
      { recursive: true }
    );
    const installed = probe();
    expect(installed.status, installed.stderr).toBe(0);
  });
});
