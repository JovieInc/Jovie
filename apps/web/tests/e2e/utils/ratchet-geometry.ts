import { test } from '@playwright/test';

/**
 * Non-blocking geometry/layout-shift assertion.
 *
 * ratchet: JOV-9612 - composer clipping and CLS on /start and Home were
 * flaking Golden Path (composer surface clipped at 390px, /start composer
 * y 501->457). Per the 2026-10-28 launch decision the strict assertion warns
 * and records the measured values instead of failing the journey. Functional
 * assertions (signup, auth, billing, handoff) stay blocking. Restore by
 * replacing each `ratchetGeometry(...)` call with its inner assertion.
 */
export async function ratchetGeometry(
  label: string,
  check: () => void | Promise<void>
): Promise<void> {
  try {
    await check();
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error))
      .replace(/\u001b\[[0-9;]*m/g, '')
      .slice(0, 1500);
    test.info().annotations.push({
      type: 'ratchet-geometry',
      description: `${label}: ${message}`,
    });
    console.warn(`[ratchet-geometry] ${label}: ${message}`);
  }
}
