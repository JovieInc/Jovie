import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  LATENCY_SENSITIVE_CHECK_CLASS,
  LATENCY_SENSITIVE_INVARIANT_ID,
  LATENCY_SENSITIVE_SCHEMA,
  LATENCY_SENSITIVE_SLUG,
  ROUTE_LATENCY_CHECK_CLASS,
  ROUTE_LATENCY_CONTRACT,
  diffAllowlist,
  scanFixture,
  scanRuntime,
  validateEslintSelectors,
  validateLatencySensitiveExecution,
} from './latency-sensitive-execution.mjs';
import { readInvariantRegistry } from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('JOV-INV-031 latency-sensitive-execution-v1', () => {
  it('keeps thread-blocking distinct from route-response-latency', () => {
    assert.equal(LATENCY_SENSITIVE_CHECK_CLASS, 'thread-blocking');
    assert.equal(ROUTE_LATENCY_CHECK_CLASS, 'route-response-latency');
    assert.equal(ROUTE_LATENCY_CONTRACT, 'docs/performance/performance-invariants-v1.md');
    assert.equal(LATENCY_SENSITIVE_SLUG, 'jovie/coordination/latency-sensitive-execution-v1');
    assert.equal(LATENCY_SENSITIVE_SCHEMA, 'jovie-latency-sensitive-execution/v1');
    assert.equal(LATENCY_SENSITIVE_INVARIANT_ID, 'JOV-INV-031');
    assert.notEqual(LATENCY_SENSITIVE_CHECK_CLASS, ROUTE_LATENCY_CHECK_CLASS);
  });

  it('does not invent route-response-latency budgets', () => {
    const source = readFileSync(
      path.join(HERE, 'latency-sensitive-execution.mjs'),
      'utf8'
    );
    assert.match(source, /This gate invents none/);
    assert.match(source, /does not change[\s\S]*crawler\/bot wait/);
    assert.doesNotMatch(source, /interactive-shell-ready/);
  });

  it('accepts the checked-in runtime allowlist', () => {
    const errors = validateLatencySensitiveExecution();
    assert.deepEqual(errors, []);
    const findings = scanRuntime();
    assert.ok(findings.length > 0);
    assert.ok(findings.every(item => item.checkClass === 'thread-blocking'));
  });

  it('rejects sync fs in generateMetadata', () => {
    const hits = scanFixture('red-metadata');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].callee, 'readFileSync');
    assert.match(hits[0].path, /generateMetadata|page\.tsx$/);
  });

  it('rejects the same sync call moved into a shared helper', () => {
    const hits = scanFixture('red-helper');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].callee, 'readFileSync');
    assert.equal(hits[0].path, 'apps/web/lib/get-profile.ts');
  });

  it('rejects an async wrapper that still blocks', () => {
    const hits = scanFixture('red-async-wrap');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].callee, 'readFileSync');
    assert.equal(hits[0].path, 'apps/web/lib/load-profile.ts');
  });

  it('rejects aliased sync I/O as the original callee', () => {
    const hits = scanFixture('red-alias');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].callee, 'readFileSync');
    assert.equal(hits[0].path, 'apps/web/lib/alias-read.ts');
  });

  it('rejects existsSync inside a request-path function', () => {
    const hits = scanFixture('red-exists-in-handler');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].callee, 'existsSync');
    assert.equal(hits[0].gray, true);
  });

  it('keeps tooling-only scripts/ and bounded sync transforms green', () => {
    assert.deepEqual(scanFixture('green-bounded'), []);
    assert.deepEqual(scanFixture('green-tooling'), []);
    assert.deepEqual(scanFixture('green-exists-toplevel'), []);
  });

  it('treats a count increase as a new violation and a decrease as stale allowlist', () => {
    const observed = {
      entries: { 'apps/web/lib/example.ts': { readFileSync: 2 } },
    };
    const increased = diffAllowlist(observed, {
      entries: { 'apps/web/lib/example.ts': { readFileSync: 1 } },
    });
    assert.equal(increased.length, 1);
    assert.match(increased[0], /thread-blocking new:/);

    const decreased = diffAllowlist(observed, {
      entries: { 'apps/web/lib/example.ts': { readFileSync: 3 } },
    });
    assert.equal(decreased.length, 1);
    assert.match(decreased[0], /thread-blocking stale-allowlist:/);
  });

  it('requires eslint selectors for forbidden callees and both check classes', () => {
    assert.deepEqual(validateEslintSelectors(), []);
  });

  it('binds JOV-INV-031 in the adopted registry', () => {
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === 'JOV-INV-031'
    );
    assert.ok(invariant);
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.equal(invariant.policy.value.checkClass, 'thread-blocking');
    assert.equal(invariant.policy.value.siblingCheckClass, 'route-response-latency');
    assert.equal(invariant.policy.value.inventBudgets, false);
  });
});
