'use client';

import { useDesktopAppBootSignal } from '@/lib/desktop/electron-bridge';

/**
 * /hud is outside /app/* so it never mounts ClientProviders. Without this
 * ping, Jovie Local's boot watchdog replaces a painted HUD with a false
 * offline recovery page.
 */
export function HudDesktopBootSignal() {
  useDesktopAppBootSignal();
  return null;
}
