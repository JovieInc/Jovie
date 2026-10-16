'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isElectronRuntime } from '@/lib/desktop/electron-bridge';
import { macCompatibility } from '@/lib/desktop/mac-compatibility';
import {
  isSwEnabled,
  registerServiceWorker,
  unregisterServiceWorker,
} from '@/lib/service-worker/control';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

const DISMISSED_KEY = 'jv_pwa_dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Module-level capture: the beforeinstallprompt event can fire before React
// hydrates and useEffect runs.  Stash it so the hook can pick it up later.
let _earlyPromptEvent: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined' && isElectronRuntime()) {
  // Desktop shells must never keep a PWA service worker controlling auth routes.
  unregisterServiceWorker().catch(() => {});
} else if (typeof window !== 'undefined') {
  // Register the service worker early -- Chrome requires a registered SW with
  // a fetch handler before it will fire beforeinstallprompt.
  // In development, skip registration (and unregister any stale SW) unless
  // explicitly opted in via the dev toolbar toggle.
  if (isSwEnabled()) {
    registerServiceWorker();
  } else {
    unregisterServiceWorker().catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _earlyPromptEvent = e as BeforeInstallPromptEvent;
  });
}

function isDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISSED_KEY));
    return ts > 0 && Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function usePWAInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const isElectron = isElectronRuntime();
  const [platformAllowsPrompt, setPlatformAllowsPrompt] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(
    () => !isElectron && isStandalone()
  );
  const isIOS =
    !isElectron &&
    typeof navigator !== 'undefined' &&
    isIOSSafari() &&
    !isStandalone();

  useEffect(() => {
    if (isElectronRuntime()) return;
    let cancelled = false;
    let eligible = false;
    const controller = new AbortController();
    const canOffer = () => !isStandalone() && !isDismissed();
    const offer = () => {
      if (eligible && canOffer() && (deferredPrompt.current || isIOSSafari()))
        setCanPrompt(true);
    };
    function onBeforeInstall(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      if (isElectronRuntime()) {
        deferredPrompt.current = null;
        setCanPrompt(false);
        setPlatformAllowsPrompt(false);
        return;
      }
      deferredPrompt.current = e;
      _earlyPromptEvent = null;
      offer();
    }
    function onAppInstalled() {
      deferredPrompt.current = null;
      setCanPrompt(false);
      setIsInstalled(true);
    }
    deferredPrompt.current = _earlyPromptEvent;
    _earlyPromptEvent = null;
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    async function resolveEligibility() {
      let compatibility = macCompatibility(navigator);
      // macOS browser UAs can be frozen. Client hints resolve the real OS on
      // Chromium; absence/failure stays unknown and quiet, never "compatible".
      if (compatibility === 'unknown') {
        const hints = (
          navigator as Navigator & {
            userAgentData?: {
              getHighEntropyValues(
                keys: string[]
              ): Promise<{ platformVersion?: string }>;
            };
          }
        ).userAgentData;
        try {
          const result = await Promise.race([
            hints?.getHighEntropyValues(['platformVersion']),
            new Promise<undefined>(resolve => setTimeout(resolve, 1000)),
          ]);
          compatibility = macCompatibility(navigator, result?.platformVersion);
        } catch {
          /* Keep unknown; do not infer installation or compatibility. */
        }
      }
      let allow = compatibility === 'other' || compatibility === 'incompatible';
      if (!allow) {
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(
            '/api/desktop/download?format=capabilities',
            {
              signal: controller.signal,
            }
          );
          const result: unknown = response.ok ? await response.json() : null;
          // Explicit unavailability preserves web fallback. Missing/malformed
          // availability evidence never starts an installation advertisement.
          allow =
            typeof result === 'object' &&
            result !== null &&
            'available' in result &&
            result.available === false;
        } catch {
          /* Availability unknown: remain quiet, without altering PWA data. */
        } finally {
          clearTimeout(timeout);
        }
      }
      if (cancelled) return;
      eligible = allow && !isElectronRuntime();
      setPlatformAllowsPrompt(eligible);
      offer();
    }
    void resolveEligibility();
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (
      isElectronRuntime() ||
      !platformAllowsPrompt ||
      isStandalone() ||
      isDismissed()
    ) {
      setCanPrompt(false);
      return;
    }
    const prompt = deferredPrompt.current;
    if (!prompt) {
      // Prompt unavailable — hide the banner rather than leaving a dead button
      setCanPrompt(false);
      return;
    }

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // If user declined the native prompt, persist dismissal so the banner
      // doesn't reappear on the next page load.
      if (outcome === 'dismissed') {
        try {
          localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        } catch {
          // ignore
        }
      }
    } catch {
      // prompt() can throw if the event was already consumed or invalidated
    } finally {
      deferredPrompt.current = null;
      setCanPrompt(false);
    }
  }, [platformAllowsPrompt]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setCanPrompt(false);
  }, []);

  return {
    canPrompt: !isElectron && platformAllowsPrompt && canPrompt,
    isInstalled,
    isIOS,
    install,
    dismiss,
  };
}
