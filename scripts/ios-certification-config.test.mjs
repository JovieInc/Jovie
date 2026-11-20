import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import nativeFlow from '../canon/certification/flows/jovie-ios.mjs';

const root = resolve(import.meta.dirname, '..');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const config = json('canon/certification/jovie-ios.json');
const web = json('canon/certification/jovie-web.json');

test('iOS prelaunch config has concrete native outcomes and existing sources', () => {
  assert.equal(config.stage, 'prelaunch');
  assert.doesNotMatch(JSON.stringify(config), /\bTODO\b/);
  assert.deepEqual(
    config.goldenPath.stages.map(stage => stage.kind),
    ['entry', 'signup', 'onboarding', 'first-value', 'paid-conversion']
  );
  assert.ok(config.goldenPath.stages.every(stage => stage.surface === 'ios'));
  assert.deepEqual(Object.keys(config.goldenPath.flows), ['ios']);
  for (const source of [
    ...Object.values(config.goldenPath.flows),
    config.paidOutcome.priceSource,
    config.buyer.personas,
    config.buyer.calibration,
    config.privacy.registry,
  ])
    assert.ok(existsSync(resolve(root, source)), source);
});

test('shared billing reads the current canonical price and attribution', () => {
  const paid = config.paidOutcome;
  const source = readFileSync(resolve(root, paid.priceSource), 'utf8');
  const matches = [...source.matchAll(new RegExp(paid.pricePattern, 'gu'))];
  assert.equal(matches.length, 1, 'price must be unambiguous');
  assert.equal(Number(matches[0][1]), paid.price);
  for (const field of ['plan', 'currency', 'interval', 'priceSource'])
    assert.equal(paid[field], web.paidOutcome[field]);
  assert.deepEqual(config.waste, web.waste);
  assert.deepEqual(config.capacity, web.capacity);
});

test('native privacy and support point to the shipped Settings destinations', () => {
  const settings = readFileSync(
    resolve(root, 'apps/ios/Jovie/Features/Settings/SettingsView.swift'),
    'utf8'
  );
  assert.ok(settings.includes(config.privacy.policyUrl));
  assert.ok(settings.includes('https://jov.ie/support'));
  assert.equal(config.goldenPath.accounts.policy, 'canary-only');
  assert.ok(
    config.goldenPath.accounts.source.includes('prodcert-identities.ts')
  );
  assert.equal(config.customerVoice.approval, 'tim');
  assert.equal(config.customerVoice.sink, web.customerVoice.sink);
  assert.equal(config.customerVoice.channels[0].status, 'pending');
});

test('config validity cannot manufacture native runtime certification', async () => {
  // The current native adapter remains closed until a real device walk exists.
  // A browser walk or simulator fixture must not silently substitute for it.
  await assert.rejects(nativeFlow(), /write the golden-path flow/);
  assert.deepEqual(
    json('canon/certification/jovie-ios-calibration.json').positiveCanaries,
    []
  );
});
