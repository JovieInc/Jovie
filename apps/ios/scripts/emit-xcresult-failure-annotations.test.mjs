import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const emitterPath = path.join(
  scriptDir,
  'emit-xcresult-failure-annotations.mjs'
);

// Mirrors the JSON Schema xcresulttool publishes for
// `get test-results tests` (Xcode 16+): testNodes carry
// nodeType/name/nodeIdentifier/result and failed Test Case nodes hold
// Failure Message children whose `name` is the assertion text.
function testCase(name, result, failureMessages = []) {
  return {
    nodeType: 'Test Case',
    name,
    nodeIdentifier: `JovieUITests/${name}`,
    result,
    children: failureMessages.map(message => ({
      nodeType: 'Failure Message',
      name: message,
      result: 'Failed',
    })),
  };
}

function reportFor(rootNodes) {
  return { testPlanConfigurations: [], devices: [], testNodes: rootNodes };
}

function uiTestBundle(children) {
  return {
    nodeType: 'UI test bundle',
    name: 'JovieUITests.xctest',
    result: children.some(child => child.result === 'Failed')
      ? 'Failed'
      : 'Passed',
    children: [
      {
        nodeType: 'Test Suite',
        name: 'JovieUITests',
        result: children.some(child => child.result === 'Failed')
          ? 'Failed'
          : 'Passed',
        children,
      },
    ],
  };
}

function runEmitter(input) {
  return spawnSync('node', [emitterPath], {
    input,
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('a passing report emits no annotations', () => {
  const result = runEmitter(
    JSON.stringify(
      reportFor([
        uiTestBundle([testCase('testReadyLaunchShowsProfileTab()', 'Passed')]),
      ])
    )
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('a failed UI test becomes a named annotation with its failure text', () => {
  const result = runEmitter(
    JSON.stringify(
      reportFor([
        uiTestBundle([
          testCase('testReadyLaunchShowsProfileTab()', 'Passed'),
          testCase('testDrawerSwitchesBetweenChatAndProfile()', 'Failed', [
            'JovieUITests.swift:462: Failed to find: chat drawer toggle',
          ]),
        ]),
      ])
    )
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    '::error::iOS test failed: JovieUITests/testDrawerSwitchesBetweenChatAndProfile() — JovieUITests.swift:462: Failed to find: chat drawer toggle\n'
  );
});

test('expected failures and skipped tests are not annotated', () => {
  const result = runEmitter(
    JSON.stringify(
      reportFor([
        uiTestBundle([
          testCase('testDeliberatelyExpectedToFail()', 'Expected Failure'),
          testCase('testSkippedOniPad()', 'Skipped'),
        ]),
      ])
    )
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('a failed container with no failed cases is annotated (crash class)', () => {
  const result = runEmitter(
    JSON.stringify(
      reportFor([
        {
          nodeType: 'Test Plan',
          name: 'Jovie',
          result: 'Failed',
          children: [
            {
              nodeType: 'UI test bundle',
              name: 'JovieUITests.xctest',
              result: 'Failed',
              children: [],
            },
          ],
        },
      ])
    )
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /::error::iOS test failed: Jovie\/JovieUITests\.xctest\n/
  );
});

test('more failures than the cap get an overflow notice', () => {
  const cases = [];
  for (let index = 0; index < 10; index += 1) {
    cases.push(testCase(`testFlaky${index}()`, 'Failed'));
  }
  const result = runEmitter(JSON.stringify(reportFor([uiTestBundle(cases)])));
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 9);
  assert.match(
    lines[0],
    /::error::iOS test failed: JovieUITests\/testFlaky0\(\)/
  );
  assert.match(
    lines[7],
    /::error::iOS test failed: JovieUITests\/testFlaky7\(\)/
  );
  assert.match(
    lines[8],
    /::error::iOS test failures: 10 failed tests; showing first 8/
  );
});

test('annotation data is sanitized against workflow-command injection', () => {
  const result = runEmitter(
    JSON.stringify(
      reportFor([
        uiTestBundle([
          testCase('testInjection()', 'Failed', [
            'first line\r\n::error::injected %0A 100% broken',
          ]),
        ]),
      ])
    )
  );
  assert.equal(result.status, 0, result.stderr);
  // CR/LF must never start a second workflow command, and % must be escaped.
  const emitted = result.stdout.trim();
  assert.equal(emitted.split('\n').length, 1);
  assert.match(emitted, /iOS test failed: JovieUITests\/testInjection\(\)/);
  assert.match(emitted, /%25/);
  const commands = emitted
    .split('\n')
    .filter(line => line.startsWith('::error::'));
  assert.equal(commands.length, 1);
});

test('malformed input degrades silently to a zero exit', () => {
  for (const input of ['', 'not json at all', '{"testNodes": 42}']) {
    const result = runEmitter(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
});
