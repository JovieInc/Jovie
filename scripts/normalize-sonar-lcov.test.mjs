import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  COVERAGE_PACKAGES,
  normalizeCoverageReports,
  normalizeLcov,
  prepareSonarSources,
} from './normalize-sonar-lcov.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sonar-lcov-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text = '// fixture\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const pkg of COVERAGE_PACKAGES) write(`${pkg}/lib/utils.ts`);
  write('apps/web/app/.well-known/oauth/route.ts');
  write('apps/web/app/page.tsx');
  write(
    'sonar-project.properties',
    'sonar.sources=apps/web,packages/ui\nsonar.tests=apps/web,packages/ui\nsonar.exclusions=**/.storybook/**\n'
  );
  return { root, write };
}
const record = source =>
  `TN:\nSF:${source}\nFN:1,example\nFNDA:1,example\nDA:1,1\nBRDA:1,0,0,1\nend_of_record\n`;

test('CI normalizes both reports before scanning and indexes all measured web roots', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/sonarcloud.yml', import.meta.url),
    'utf8'
  );
  const prepare = workflow.indexOf(
    'run: node scripts/normalize-sonar-lcov.mjs'
  );
  assert.ok(
    prepare > workflow.indexOf('name: Verify packages/ui coverage artifact')
  );
  assert.ok(prepare < workflow.indexOf('name: SonarQube Scan'));
  const properties = readFileSync(
    new URL('../sonar-project.properties', import.meta.url),
    'utf8'
  );
  assert.match(properties, /^sonar.sources=apps\/web,packages\/ui$/m);
  assert.match(properties, /^sonar.tests=apps\/web,packages\/ui$/m);
});

test('same-named files keep their producer identity and every metric byte', t => {
  const { root } = fixture(t);
  for (const pkg of COVERAGE_PACKAGES) {
    const input = record('lib/utils.ts') + record('lib/utils.ts');
    const output = normalizeLcov(input, root, pkg);
    assert.equal(output.records, 2);
    assert.equal(
      output.text,
      input.replaceAll('SF:lib/utils.ts', `SF:${pkg}/lib/utils.ts`)
    );
    assert.deepEqual(normalizeLcov(output.text, root, pkg), output);
  }
});

test('absolute local paths, CRLF and literal Next.js brackets survive', t => {
  const { root, write } = fixture(t);
  const path = 'apps/web/app/[username]/[...slug]/page.tsx';
  write(path);
  const input = record(join(root, path)).replaceAll('\n', '\r\n');
  assert.equal(
    normalizeLcov(input, root, 'apps/web').text,
    input.replace(join(root, path), path)
  );
});

test('missing files, empty records and unsupported foreign paths fail closed', t => {
  const { root } = fixture(t);
  for (const source of [
    '',
    'missing.ts',
    'bad\0path.ts',
    'C:\\foreign\\file.ts',
  ]) {
    assert.throws(() => normalizeLcov(record(source), root, 'apps/web'));
  }
  assert.throws(
    () => normalizeLcov('TN:\nend_of_record\n', root, 'apps/web'),
    /No LCOV/
  );
});

test('cross-package paths, directories and symlinks cannot reassign coverage', t => {
  const { root } = fixture(t);
  symlinkSync(
    join(root, 'packages/ui/lib/utils.ts'),
    join(root, 'apps/web/link.ts')
  );
  for (const source of [
    '../../packages/ui/lib/utils.ts',
    join(root, 'packages/ui/lib/utils.ts'),
    '.',
    '..',
    'lib',
    'link.ts',
  ]) {
    assert.throws(
      () => normalizeLcov(record(source), root, 'apps/web'),
      /escapes|not a file/
    );
  }
});

test('both reports must validate before any report is rewritten', t => {
  const { root, write } = fixture(t);
  const path = 'apps/web/coverage/lcov.info';
  write(path, record('lib/utils.ts'));
  assert.throws(() => normalizeCoverageReports(root), /ENOENT/);
  assert.equal(readFileSync(join(root, path), 'utf8'), record('lib/utils.ts'));
  write('packages/ui/coverage/lcov.info', record('missing.ts'));
  assert.throws(() => normalizeCoverageReports(root), /ENOENT/);
  assert.equal(readFileSync(join(root, path), 'utf8'), record('lib/utils.ts'));
  write('packages/ui/coverage/lcov.info', record('lib/utils.ts'));
  assert.deepEqual(normalizeCoverageReports(root), [1, 1]);
  for (const pkg of COVERAGE_PACKAGES) {
    assert.equal(
      readFileSync(join(root, pkg, 'coverage/lcov.info'), 'utf8'),
      record(`${pkg}/lib/utils.ts`)
    );
  }
});

test('the production CLI exits nonzero on absent evidence and rewrites valid reports', t => {
  const { root, write } = fixture(t);
  const cli = new URL('./normalize-sonar-lcov.mjs', import.meta.url).pathname;
  const failed = spawnSync(process.execPath, [cli], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /ENOENT/);
  for (const pkg of COVERAGE_PACKAGES)
    write(`${pkg}/coverage/lcov.info`, record('lib/utils.ts'));
  const success = spawnSync(process.execPath, [cli], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /web=1, ui=1/);
  assert.match(
    readFileSync(join(root, 'sonar-project.properties'), 'utf8'),
    /^sonar.sources=.*apps\/web\/app\/\.well-known\/oauth/m
  );
});

test('hidden discovery routes receive disjoint visible roots without dropping other scope', t => {
  const { root, write } = fixture(t);
  write('apps/web/app/.well-known/metadata.test.ts');
  write('apps/web/.claude/quality.json');
  write('apps/web/.storybook/preview.ts');
  write('apps/web/reports/generated.json');
  const prepared = prepareSonarSources(root);
  const roots = prepared.text.match(/^sonar.sources=(.+)$/m)[1].split(',');
  assert.ok(roots.includes('apps/web/app/.well-known/oauth'));
  assert.ok(roots.includes('apps/web/app/.well-known/metadata.test.ts'));
  for (const path of [
    'apps/web/app/page.tsx',
    'apps/web/lib',
    'apps/web/.claude',
    'apps/web/.storybook',
    'apps/web/reports',
    'packages/ui',
  ]) {
    assert.ok(roots.includes(path), path);
  }
  for (const path of roots) {
    assert.ok(
      !roots.some(other => other !== path && path.startsWith(`${other}/`)),
      path
    );
  }
  assert.equal(prepared.text.match(/^sonar.tests=(.+)$/m)[1], roots.join(','));
  assert.match(prepared.text, /^sonar.exclusions=\*\*\/\.storybook\/\*\*$/m);
  assert.ok(!prepared.text.includes('excludeHiddenFiles'));
  write('sonar-project.properties', prepared.text);
  assert.deepEqual(prepareSonarSources(root), prepared);
});

test('source preparation rejects missing discovery roots, unsafe paths, and changed canonical scope', t => {
  const { root, write } = fixture(t);
  rmSync(join(root, 'apps/web/app/.well-known'), { recursive: true });
  assert.throws(() => prepareSonarSources(root), /ENOENT/);
  mkdirSync(join(root, 'apps/web/app/.well-known'));
  assert.throws(() => prepareSonarSources(root), /Missing discovery sources/);
  write('apps/web/app/.well-known/oauth/route.ts');
  write('apps/web/bad,name/file.ts');
  assert.throws(
    () => prepareSonarSources(root),
    /Unsupported Sonar source root/
  );
  rmSync(join(root, 'apps/web/bad,name'), { recursive: true });
  write(
    'sonar-project.properties',
    'sonar.sources=apps/web/lib\nsonar.tests=apps/web,packages/ui\n'
  );
  assert.throws(() => prepareSonarSources(root), /Unexpected sonar.sources/);
});

test('ambiguous Java property overrides cannot survive source preparation', t => {
  const { root, write } = fixture(t);
  for (const override of [
    'sonar.sources: apps/web/lib',
    '  sonar.sources=apps/web/lib',
    'sonar.tests apps/web/lib',
    'sonar.sources',
    'sonar.tests',
    String.raw`sonar\.sources=apps/web/lib`,
    String.raw`sonar\u002etests=apps/web/tests`,
    '\fsonar.sources=apps/web/lib',
  ]) {
    write(
      'sonar-project.properties',
      `sonar.sources=apps/web,packages/ui\nsonar.tests=apps/web,packages/ui\n${override}\n`
    );
    assert.throws(() => prepareSonarSources(root), /Unexpected/);
  }
});

test('canonical property validation preserves comments and continued exclusion values', t => {
  const { root, write } = fixture(t);
  const suffix =
    '# comment ending in a backslash\\\n! another comment\nsonar.exclusions=\\\n  **/.storybook/**,\\\n  **/node_modules/**\nother.value=two\\\\\n';
  write(
    'sonar-project.properties',
    `sonar.sources=apps/web,packages/ui\nsonar.tests=apps/web,packages/ui\n${suffix}`
  );
  assert.ok(prepareSonarSources(root).text.endsWith(suffix));
  write(
    'sonar-project.properties',
    'sonar.sources=apps/web,packages/ui\nsonar.tests=apps/web,packages/ui\nother.value=unfinished\\'
  );
  assert.throws(() => prepareSonarSources(root), /Unterminated/);
});
