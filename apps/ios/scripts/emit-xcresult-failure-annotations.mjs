#!/usr/bin/env node
// Surfaces failing Xcode tests as GitHub check-run annotations (JOV-7763,
// completing the JOV-5371 intent in run-xcodebuild.sh, whose comment already
// promised "surface the failing test names as GitHub annotations" while the
// implementation only printed collapsed ::group:: log blocks. Those groups are
// readable solely through admin-gated job logs, so every remote triage of an
// exit-65 iOS regression saw nothing but the generic failure line — six
// blind-recurrence episodes on Linear JOV-7763, including a mis-triage that
// blamed the unrelated Wallet env-validation noise.)
//
// Reads the JSON emitted by `xcrun xcresulttool get test-results tests` on
// stdin and prints one `::error::` workflow command per failed test, capped
// and sanitized. Diagnostics only: this script never exits non-zero, never
// writes anything on unparseable input, and run-xcodebuild.sh still emits its
// generic error line, so an xcresulttool format change can only degrade back
// to the pre-existing single-annotation behavior — never block the lane.

import process from 'node:process';

const MAX_ANNOTATED_FAILURES = 8;
const MAX_MESSAGE_CHARS = 400;

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      resolve(input);
    });
    process.stdin.on('error', reject);
  });
}

// Workflow-command data may not carry raw %, CR or LF; newlines would split
// one annotation into several broken commands.
function sanitizeAnnotationData(text) {
  const collapsed = text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const escaped = collapsed.replace(/%/g, '%25');
  return escaped.length > MAX_MESSAGE_CHARS
    ? `${escaped.slice(0, MAX_MESSAGE_CHARS - 1)}…`
    : escaped;
}

function nodeIdentifier(node, ancestry) {
  if (typeof node.nodeIdentifier === 'string' && node.nodeIdentifier !== '') {
    return node.nodeIdentifier;
  }
  return [...ancestry, typeof node.name === 'string' ? node.name : '']
    .filter(part => part !== '')
    .join('/');
}

function failureMessages(children) {
  if (!Array.isArray(children)) {
    return [];
  }
  return children
    .filter(
      child =>
        child !== null &&
        typeof child === 'object' &&
        child.nodeType === 'Failure Message' &&
        typeof child.name === 'string' &&
        child.name !== ''
    )
    .map(child => child.name);
}

// Container node types whose own failure can be annotated when no test case
// below them failed (the crashed-before-cases class). 'Failure Message' and
// other detail node types are deliberately excluded: they are children of a
// failed case, not independently failing nodes.
const CONTAINER_NODE_TYPES = new Set([
  'Test Plan',
  'UI test bundle',
  'Unit test bundle',
  'Test Suite',
]);

// Recursively walks the xcresulttool testNodes tree and returns
// { failedCases, failedContainers }: a container is a failed suite, bundle or
// plan whose subtree reported no failed test case — the crashed-before-cases
// class.
function collectFailures(nodes, ancestry, failedCases, failedContainers) {
  let subtreeFailed = false;
  for (const node of nodes) {
    if (node === null || typeof node !== 'object') {
      continue;
    }
    const name = typeof node.name === 'string' ? node.name : '';
    const children = Array.isArray(node.children) ? node.children : [];
    const childFailed = collectFailures(
      children,
      [...ancestry, name],
      failedCases,
      failedContainers
    );
    subtreeFailed = subtreeFailed || childFailed;
    const result = typeof node.result === 'string' ? node.result.trim() : '';
    if (!/^failed$/i.test(result)) {
      continue;
    }
    subtreeFailed = true;
    if (node.nodeType === 'Test Case') {
      failedCases.push({
        identifier: nodeIdentifier(node, ancestry),
        messages: failureMessages(children),
      });
    } else if (CONTAINER_NODE_TYPES.has(node.nodeType) && !childFailed) {
      failedContainers.push({
        identifier: nodeIdentifier(node, ancestry),
        messages: failureMessages(children),
      });
    }
  }
  return subtreeFailed;
}

function annotationFor(failure) {
  const identifier = sanitizeAnnotationData(
    failure.identifier || 'unknown test'
  );
  const message =
    failure.messages.length > 0
      ? sanitizeAnnotationData(failure.messages[0])
      : '';
  const detail = message !== '' ? ` — ${message}` : '';
  return `::error::iOS test failed: ${identifier}${detail}`;
}

function emitAnnotations(report) {
  const rootNodes = Array.isArray(report?.testNodes)
    ? report.testNodes
    : Array.isArray(report)
      ? report
      : [];
  const failedCases = [];
  const failedContainers = [];
  collectFailures(rootNodes, [], failedCases, failedContainers);
  const failures = [...failedCases, ...failedContainers];
  if (failures.length === 0) {
    return;
  }
  for (const failure of failures.slice(0, MAX_ANNOTATED_FAILURES)) {
    process.stdout.write(`${annotationFor(failure)}\n`);
  }
  if (failures.length > MAX_ANNOTATED_FAILURES) {
    process.stdout.write(
      `::error::iOS test failures: ${failures.length} failed tests; showing first ${MAX_ANNOTATED_FAILURES}; see the xcresult failing-tests log group for the rest\n`
    );
  }
}

try {
  const input = await readStdin();
  const report = JSON.parse(input);
  emitAnnotations(report);
} catch {
  // Unparseable or empty report: degrade silently to run-xcodebuild.sh's
  // generic error annotation rather than emitting partial diagnostics.
}
