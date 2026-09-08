import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ESLINT_CONFIG_PATH,
  IOS_WEB_NO_SCROLL_JANK_CHECK_CLASS,
  IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID,
  IOS_WEB_NO_SCROLL_JANK_SCHEMA,
  IOS_WEB_NO_SCROLL_JANK_SLUG,
  scanFixture,
  validateIosWebNoScrollJank,
} from './ios-web-no-scroll-jank.mjs';
import { readInvariantRegistry } from './registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function rules(findings) {
  return new Set(findings.map(item => item.rule));
}

describe('JOV-INV-032 ios-web-no-scroll-jank-v1', () => {
  it('keeps the iOS Safari scroll-jank check class and GBrain slug', () => {
    assert.equal(IOS_WEB_NO_SCROLL_JANK_CHECK_CLASS, 'ios-safari-scroll-jank');
    assert.equal(
      IOS_WEB_NO_SCROLL_JANK_SLUG,
      'jovie/coordination/ios-web-no-scroll-jank-v1'
    );
    assert.equal(
      IOS_WEB_NO_SCROLL_JANK_SCHEMA,
      'jovie-ios-web-no-scroll-jank/v1'
    );
    assert.equal(IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID, 'JOV-INV-032');
  });

  it('does not invent scroll-FPS or INP budgets', () => {
    const source = readFileSync(
      path.join(HERE, 'ios-web-no-scroll-jank.mjs'),
      'utf8'
    );
    assert.match(source, /This gate invents no scroll-FPS \/ INP budgets/);
    assert.doesNotMatch(source, /interactive-shell-ready/);
  });

  it('accepts the checked-in public-web surfaces', () => {
    assert.deepEqual(validateIosWebNoScrollJank(), []);
  });

  it('rejects the deliberate-red fixture', () => {
    const hits = scanFixture('red-all');
    const found = rules(hits);
    assert.ok(found.has('non-passive-scroll-listener'));
    assert.ok(found.has('layout-force-in-scroll-handler'));
    assert.ok(found.has('100vh-mobile-chrome'));
    assert.ok(found.has('body-scroll-lock-ios'));
    assert.ok(found.has('overscroll-none-root'));
    assert.ok(found.has('touch-action-none-root'));
    assert.ok(found.has('will-change-spam'));
  });

  it('accepts passive listeners, rAF, svh cascade, and scrollY-safe locks', () => {
    assert.deepEqual(scanFixture('green-ok'), []);
  });

  it('binds JOV-INV-032 in the adopted registry without an ESLint lane', () => {
    const invariant = readInvariantRegistry().invariants.find(
      item => item.id === IOS_WEB_NO_SCROLL_JANK_INVARIANT_ID
    );
    assert.ok(invariant);
    assert.equal(invariant.lifecycle.state, 'adopted');
    assert.equal(invariant.policy.value.checkClass, 'ios-safari-scroll-jank');
    assert.equal(invariant.policy.value.eslintLane, false);
    assert.equal(invariant.policy.value.biomePrimary, true);
    assert.equal(invariant.policy.value.inventMetrics, false);
    assert.equal(
      invariant.policy.value.gbrainSlug,
      'jovie/coordination/ios-web-no-scroll-jank-v1'
    );
    assert.ok(
      !invariant.enforcementConsumers.some(
        item => item.path === ESLINT_CONFIG_PATH
      )
    );
  });
});
