import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  checkVendored,
  loadManifest,
  stripBuildDirectives,
  VENDOR_ROOT,
  workflowPins,
} from '../../vendor-actions.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const composite = readFileSync(
  resolve(repoRoot, '.github/actions/setup-node-pnpm/action.yml'),
  'utf8'
);

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'vendored-actions-'));
  for (const dir of ['.github/workflows', '.github/actions'])
    cpSync(resolve(repoRoot, dir), join(root, dir), { recursive: true });
  return root;
}

describe('vendored actions (JOV-8754)', () => {
  it('removes build directives without changing runtime strings, tokens or licenses', () => {
    const lint = ['eslint', 'disable-next-line'].join('-');
    const type = ['@ts', 'ignore'].join('-');
    const source = [
      '/*! MIT license: preserve this notice */',
      `// ${lint} no-console`,
      `const literal = "// ${lint}";`,
      `const template = \`/* ${type} */\`;`,
      `const regex = /https?:\\/\\//; // ${lint}`,
      `const value = 1/* ${lint} */+2;`,
      `if (value) { /* ${lint} */`,
      `  // ${type}`,
      `  globalThis.result = [literal, template, regex.test('https://example.com'), value];`,
      '}',
      '',
    ].join('\n');
    const output = stripBuildDirectives(source);
    expect(output).toContain('/*! MIT license: preserve this notice */');
    expect(output).toContain(`"// ${lint}"`);
    expect(output).toContain(`\`/* ${type} */\``);
    expect(output.split('\n')).toHaveLength(source.split('\n').length);
    expect(output).not.toContain(`// ${type}`);
    expect(output).not.toContain(`// ${lint} no-console`);
    expect(output).not.toContain(`/* ${lint} */`);
    const before = {};
    const after = {};
    runInNewContext(source, before);
    runInNewContext(output, after);
    expect(after.result).toEqual(before.result);
    expect(stripBuildDirectives(output)).toBe(output);
    expect(() => stripBuildDirectives('const = ;')).toThrow(
      'invalid vendored JavaScript'
    );
  });

  it('requires known processing and original upstream hashes for processed actions', () => {
    const root = sandbox();
    try {
      const manifest = loadManifest(root);
      const cache = manifest.actions.find(
        action => action.dir === 'actions-cache'
      );
      cache.processing = 'unknown/v1';
      delete cache.upstreamFiles.LICENSE;
      writeFileSync(
        join(root, VENDOR_ROOT, 'manifest.json'),
        JSON.stringify(manifest)
      );
      expect(checkVendored(root)).toContain(
        'actions-cache: unknown processing unknown/v1'
      );
      expect(checkVendored(root)).toContain(
        'actions-cache/LICENSE: missing upstream hash'
      );
      const refreshed = spawnSync(
        process.execPath,
        [
          resolve(repoRoot, 'scripts/vendor-actions.mjs'),
          '--refresh',
          'actions-cache',
        ],
        { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } }
      );
      expect(refreshed.status).toBe(1);
      expect(refreshed.stderr).toContain('unknown processing unknown/v1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('match the manifest byte for byte and the SHAs the workflows pin', () => {
    expect(checkVendored(repoRoot)).toEqual([]);
    const pins = workflowPins(repoRoot);
    for (const action of loadManifest(repoRoot).actions)
      expect(pins.get(action.repo), action.repo).toEqual(new Set([action.sha]));
  });

  it('serve the setup-node-pnpm composite with no remote nested pnpm or cache action', () => {
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/pnpm-action-setup'
    );
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/actions-cache/restore'
    );
    expect(composite).toContain(
      'uses: ./.github/actions/vendor/actions-cache/save'
    );
    expect(composite).not.toMatch(/uses:\s+pnpm\/action-setup@/);
    expect(composite).not.toMatch(/uses:\s+actions\/cache(\/restore|\/save)?@/);
  });

  it('flags a tampered file, an unlisted file and a stale pin', () => {
    const root = sandbox();
    try {
      const [cache] = loadManifest(root).actions.filter(
        action => action.dir === 'actions-cache'
      );
      appendFileSync(
        join(root, VENDOR_ROOT, 'actions-cache/dist/restore-only/index.js'),
        '\n// tampered\n'
      );
      writeFileSync(join(root, VENDOR_ROOT, 'actions-cache/extra.js'), 'x');
      const workflow = join(root, '.github/workflows/zz-bump.yml');
      const bumped = `${'a'.repeat(40)}`;
      writeFileSync(
        workflow,
        `steps:\n  - uses: actions/cache/restore@${bumped}\n`
      );
      const problems = checkVendored(root);
      expect(problems).toContain(
        'actions-cache/dist/restore-only/index.js: hash mismatch'
      );
      expect(problems).toContain(
        '.github/actions/vendor/actions-cache/extra.js: not in manifest'
      );
      expect(
        problems.some(problem =>
          problem.startsWith(
            `actions-cache: vendored ${cache.repo}@${cache.sha} but workflows pin @${bumped}`
          )
        )
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a single conflicting workflow pin even while most pins match', () => {
    const root = sandbox();
    try {
      const bumped = 'a'.repeat(40);
      writeFileSync(
        join(root, '.github/workflows/zz-single-bump.yml'),
        `steps:\n  - uses: actions/cache/restore@${bumped}\n`
      );
      expect(
        checkVendored(root).some(problem =>
          problem.includes(`but workflows pin @${bumped}`)
        )
      ).toBe(true);
      const checked = spawnSync(
        process.execPath,
        [resolve(repoRoot, 'scripts/vendor-actions.mjs'), '--check'],
        { cwd: root, encoding: 'utf8' }
      );
      expect(checked.status).toBe(1);
      expect(checked.stderr).toContain(`but workflows pin @${bumped}`);
      const refreshed = spawnSync(
        process.execPath,
        [
          resolve(repoRoot, 'scripts/vendor-actions.mjs'),
          '--refresh',
          'actions-cache',
        ],
        { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } }
      );
      expect(refreshed.status).toBe(1);
      expect(refreshed.stderr).toContain('conflicting workflow pins');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
