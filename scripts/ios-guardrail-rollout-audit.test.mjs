import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateIosGuardrailRollout } from './ios-guardrail-rollout-audit.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const canonicalScript = readFileSync(
  path.join(repoRoot, 'scripts/ios-best-practices-lint.sh'),
  'utf8'
);

function makeRepo(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'ios-guardrail-audit-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function writeFixture(root, relativePath, contents) {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function writeCompliantIosRepo(root) {
  writeFixture(
    root,
    'Sources/App/App.swift',
    'import SwiftUI\n\nstruct AppView {}\n'
  );
  writeFixture(root, 'App.xcodeproj/project.pbxproj', '{}\n');
  writeFixture(root, 'scripts/ios-best-practices-lint.sh', canonicalScript);
  writeFixture(
    root,
    'package.json',
    JSON.stringify(
      {
        scripts: {
          'ios:lint': 'bash scripts/ios-best-practices-lint.sh Sources/App',
        },
      },
      null,
      2
    )
  );
  writeFixture(
    root,
    '.github/workflows/ios-ci.yml',
    [
      'name: iOS CI',
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: iOS best-practices lint',
      '        run: bash scripts/ios-best-practices-lint.sh Sources/App',
      '      - name: Build',
      '        run: xcodebuild -scheme App',
      '',
    ].join('\n')
  );
  writeFixture(
    root,
    '.claude/rules/ios.md',
    [
      '# iOS',
      'The native app must stay rock solid and blazing fast with 0 jank.',
      '## Hard Invariants',
      'Run scripts/ios-best-practices-lint.sh before the Swift build.',
      '## Performance Canon',
      'Cache-first rendering is required.',
      '## Layout Shift Prevention',
      'Reserve space for every state before swapping content.',
      '',
    ].join('\n')
  );
}

function failureCodes(result) {
  return result.failures.map(failure => failure.code).sort();
}

test('passes for an iOS repo with the portable guardrail fully adopted', t => {
  const root = makeRepo(t);
  writeCompliantIosRepo(root);

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(result.failures, []);
});

test('fails an iOS repo that has no rollout wiring', t => {
  const root = makeRepo(t);
  writeFixture(
    root,
    'Sources/App/App.swift',
    'import SwiftUI\n\nstruct AppView {}\n'
  );

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, false);
  assert.deepEqual(failureCodes(result), [
    'agent-canon-missing',
    'ci-lint-step-missing',
    'lint-entrypoint-missing',
    'lint-script-missing',
  ]);
});

test('fails when the CI guardrail runs after the Swift build', t => {
  const root = makeRepo(t);
  writeCompliantIosRepo(root);
  writeFixture(
    root,
    '.github/workflows/ios-ci.yml',
    [
      'name: iOS CI',
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: Build',
      '        run: xcodebuild -scheme App',
      '      - name: iOS best-practices lint',
      '        run: bash scripts/ios-best-practices-lint.sh Sources/App',
      '',
    ].join('\n')
  );

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, false);
  assert.deepEqual(failureCodes(result), ['ci-lint-after-build']);
});

test('requires explicit Swift source targets for package and CI lint commands', t => {
  const root = makeRepo(t);
  writeCompliantIosRepo(root);
  writeFixture(
    root,
    'package.json',
    JSON.stringify(
      {
        scripts: {
          'ios:lint': 'bash scripts/ios-best-practices-lint.sh',
        },
      },
      null,
      2
    )
  );
  writeFixture(
    root,
    '.github/workflows/ios-ci.yml',
    [
      'name: iOS CI',
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: iOS best-practices lint',
      '        run: bash scripts/ios-best-practices-lint.sh',
      '      - name: Build',
      '        run: xcodebuild -scheme App',
      '',
    ].join('\n')
  );

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, false);
  assert.deepEqual(failureCodes(result), [
    'ci-lint-target-missing',
    'lint-entrypoint-target-missing',
  ]);
});

test('accepts an equivalent lint entrypoint and any correctly ordered workflow', t => {
  const root = makeRepo(t);
  writeCompliantIosRepo(root);
  writeFixture(root, 'package.json', '{"scripts":{}}\n');
  writeFixture(
    root,
    'Makefile',
    [
      'ios-lint:',
      '\tbash scripts/ios-best-practices-lint.sh Sources/App',
      '',
    ].join('\n')
  );
  writeFixture(
    root,
    '.github/workflows/ios-ci.yml',
    [
      'name: iOS CI',
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: Build',
      '        run: xcodebuild -scheme App',
      '      - name: iOS best-practices lint',
      '        run: bash scripts/ios-best-practices-lint.sh Sources/App',
      '',
    ].join('\n')
  );
  writeFixture(
    root,
    '.github/workflows/ios-guarded.yml',
    [
      'name: iOS Guarded',
      'jobs:',
      '  test:',
      '    steps:',
      '      - name: iOS best-practices lint',
      '        run: bash scripts/ios-best-practices-lint.sh Sources/App',
      '      - name: Build',
      '        run: xcodebuild -scheme App',
      '',
    ].join('\n')
  );

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});

test('skips repos without production Swift or an Xcode project', t => {
  const root = makeRepo(t);
  writeFixture(root, 'package.json', '{"scripts":{"test":"node --test"}}\n');
  writeFixture(root, 'README.md', '# Web-only repo\n');

  const result = evaluateIosGuardrailRollout(root, { canonicalRoot: repoRoot });

  assert.equal(result.passed, true);
  assert.equal(result.skipped, true);
  assert.deepEqual(result.failures, []);
});
