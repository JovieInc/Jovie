import { describe, expect, it } from 'vitest';
import {
  collectWebProductSource,
  formatViolations,
  lineOf,
  read,
  repoPath,
  type Violation,
} from './blocking-ui-invariants';

/**
 * one-modal-layer-v1 (Tim lock 2026-09-03, JOV-5951,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * At most one overlay: an in-app sheet/dialog, a cookie/status banner, OR a
 * browser permission the app requested. Never geolocation/camera/mic while a
 * sheet is open — defer `getCurrentPosition` until no sheet/dialog is open.
 *
 * Detector (source contract, fail closed): passive product surfaces can
 * never turn a `prompt`-state geolocation permission into browser chrome
 * stacked over an in-app sheet (Exhibit B: `jov.ie/tim?mode=listen` showed
 * the browser geolocation prompt over the open Menu sheet). The only safe
 * contract a source scan can certify is that passive surfaces never request
 * at all:
 *
 *  - Every `useUserLocation(...)` call site in product source must pass
 *    `permissionMode: 'granted-only'` — cached/already-granted location
 *    only, never a browser prompt (the hook's granted-only branch is pinned
 *    by `hooks/useUserLocation.test.ts`).
 *  - No product source may call `navigator.geolocation.getCurrentPosition`
 *    directly — the hook is the only permitted path.
 *
 * Fail-closed: zero `useUserLocation` call sites found means the detector is
 * blind and the test is red.
 */

const USE_LOCATION_CALL = /useUserLocation\(/g;
const GRANTED_ONLY = /permissionMode:\s*['"]granted-only['"]/;
const DIRECT_GEOLOCATION = /navigator\.geolocation\.getCurrentPosition/;
const HOOK_SOURCE = /\/hooks\/useUserLocation\.ts$/;

describe('one-modal-layer-v1', () => {
  it('passive surfaces never trigger a browser geolocation prompt', () => {
    const files = collectWebProductSource().filter(
      file => !HOOK_SOURCE.test(file)
    );

    const violations: Violation[] = [];
    let callSites = 0;

    for (const file of files) {
      const source = read(file);

      if (DIRECT_GEOLOCATION.test(source)) {
        violations.push({
          file: repoPath(file),
          detail:
            'direct navigator.geolocation.getCurrentPosition call — location access must go through useUserLocation granted-only',
        });
      }

      for (const match of source.matchAll(USE_LOCATION_CALL)) {
        callSites += 1;
        // The call's argument object ends at the first `)` on or after the
        // opening paren within a small window — all current call sites are
        // single-expression object literals.
        const callText = source.slice(match.index, match.index + 400);
        if (!GRANTED_ONLY.test(callText)) {
          violations.push({
            file: repoPath(file),
            detail:
              `L${lineOf(source, match.index)}: useUserLocation without ` +
              "permissionMode: 'granted-only' — a prompt-state permission " +
              'becomes browser chrome that can stack over an open sheet/dialog',
          });
        }
      }
    }

    expect(
      callSites,
      '[one-modal-layer-v1] zero useUserLocation call sites scanned — detector is blind, failing closed'
    ).toBeGreaterThan(0);
    expect
      .soft(violations, formatViolations('one-modal-layer-v1', violations))
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
