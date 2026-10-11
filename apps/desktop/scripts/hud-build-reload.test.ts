import { expect, test } from 'vitest';
import {
  decideHudBuildReload,
  getHudBuildFingerprint,
  isHudRoutePath,
  isWebBuildReloadPath,
  shouldReloadWindowForWebBuild,
  UNSENT_INPUT_PROBE,
  WEB_BUILD_RELOAD_IDLE_SECONDS,
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

test('hud route path matches only the operator HUD surface', () => {
  expect(isHudRoutePath('/hud')).toBe(true);
  expect(isHudRoutePath('/hud/wiki')).toBe(true);
  expect(isHudRoutePath('/app/chat')).toBe(false);
  expect(isHudRoutePath('/desktop-auth')).toBe(false);
});

test('web build reload covers the OV app shell, not only the HUD', () => {
  expect(isWebBuildReloadPath('/hud')).toBe(true);
  expect(isWebBuildReloadPath('/app')).toBe(true);
  expect(isWebBuildReloadPath('/app/ov/chat')).toBe(true);
  expect(isWebBuildReloadPath('/application')).toBe(false);
  expect(isWebBuildReloadPath('/desktop-auth')).toBe(false);
  expect(isWebBuildReloadPath('/signin')).toBe(false);
});

const idleWindow = {
  isHud: false,
  visible: true,
  focused: false,
  audible: false,
  hasUnsentInput: false,
  workStateSafe: true,
  systemIdleSeconds: WEB_BUILD_RELOAD_IDLE_SECONDS,
};

test('app windows reload for a new web build only when nobody is using them', () => {
  expect(shouldReloadWindowForWebBuild(idleWindow)).toBe(true);
  expect(shouldReloadWindowForWebBuild({ ...idleWindow, focused: true })).toBe(
    false
  );
  expect(
    shouldReloadWindowForWebBuild({
      ...idleWindow,
      systemIdleSeconds: WEB_BUILD_RELOAD_IDLE_SECONDS - 1,
    })
  ).toBe(false);
  expect(
    shouldReloadWindowForWebBuild({
      ...idleWindow,
      focused: true,
      visible: false,
      systemIdleSeconds: 0,
    })
  ).toBe(true);
});

test('web build reload never drops unsent text or interrupts audio', () => {
  for (const guard of [
    { hasUnsentInput: true },
    { audible: true },
    { workStateSafe: false },
  ]) {
    expect(
      shouldReloadWindowForWebBuild({ ...idleWindow, visible: false, ...guard })
    ).toBe(false);
    expect(
      shouldReloadWindowForWebBuild({ ...idleWindow, isHud: true, ...guard })
    ).toBe(false);
  }
  expect(
    shouldReloadWindowForWebBuild({
      ...idleWindow,
      isHud: true,
      focused: true,
      systemIdleSeconds: 0,
    })
  ).toBe(true);
});

test('unsent input probe detects composer text only', () => {
  const probe = (fields: Array<{ value?: string; textContent?: string }>) =>
    new Function('document', `return ${UNSENT_INPUT_PROBE};`)({
      querySelectorAll: () => fields,
    });
  expect(probe([])).toBe(false);
  expect(probe([{ value: '   ' }, { textContent: '\n' }])).toBe(false);
  expect(probe([{ value: 'draft reply' }])).toBe(true);
  expect(probe([{ textContent: 'rich draft' }])).toBe(true);
});
