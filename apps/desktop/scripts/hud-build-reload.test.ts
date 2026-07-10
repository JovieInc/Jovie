import { expect, test } from 'vitest';
import {
  decideHudBuildReload,
  getHudBuildFingerprint,
  isHudRoutePath,
} from '../src/hud-build-reload.ts';

test('hud build fingerprint prefers commit sha over build id', () => {
  expect(
    getHudBuildFingerprint({
      buildId: 'build-123',
      commitSha: ' abcdef1 ',
    })
  ).toBe('sha:abcdef1');
});

test('hud build fingerprint falls back to stable build id', () => {
  expect(getHudBuildFingerprint({ buildId: 'build-123' })).toBe(
    'build:build-123'
  );
});

test('hud build fingerprint ignores missing, unknown, and development builds', () => {
  expect(getHudBuildFingerprint(null)).toBeNull();
  expect(getHudBuildFingerprint({})).toBeNull();
  expect(getHudBuildFingerprint({ buildId: 'unknown' })).toBeNull();
  expect(getHudBuildFingerprint({ buildId: 'development' })).toBeNull();
  expect(getHudBuildFingerprint({ commitSha: '' })).toBeNull();
});

test('hud reload decision captures initial fingerprint without reload', () => {
  expect(
    decideHudBuildReload({
      currentFingerprint: null,
      nextFingerprint: 'sha:abcdef1',
    })
  ).toEqual({
    nextFingerprint: 'sha:abcdef1',
    shouldReload: false,
  });
});

test('hud reload decision reloads when fingerprint changes', () => {
  expect(
    decideHudBuildReload({
      currentFingerprint: 'sha:abcdef1',
      nextFingerprint: 'sha:1234567',
    })
  ).toEqual({
    nextFingerprint: 'sha:1234567',
    shouldReload: true,
  });
});

test('hud reload decision keeps baseline on failed or empty polls', () => {
  expect(
    decideHudBuildReload({
      currentFingerprint: 'sha:abcdef1',
      nextFingerprint: null,
    })
  ).toEqual({
    nextFingerprint: 'sha:abcdef1',
    shouldReload: false,
  });
});

test('hud route path matches the canonical operator surfaces', () => {
  expect(isHudRoutePath('/hud')).toBe(true);
  expect(isHudRoutePath('/hud/wiki')).toBe(true);
  expect(isHudRoutePath('/app/admin/ops')).toBe(true);
  expect(isHudRoutePath('/app/admin/ops/kiosk')).toBe(true);
  expect(isHudRoutePath('/hud-tv')).toBe(true);
  expect(isHudRoutePath('/app/chat')).toBe(false);
  expect(isHudRoutePath('/desktop-auth')).toBe(false);
});
