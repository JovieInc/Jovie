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
} from './normalize-sonar-lcov.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sonar-lcov-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text = '// fixture\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const pkg of COVERAGE_PACKAGES) write(`${pkg}/lib/utils.ts`);
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
});
