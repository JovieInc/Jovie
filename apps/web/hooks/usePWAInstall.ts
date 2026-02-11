'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Extends the standard BeforeInstallPromptEvent from the Web App Manifest spec.
 * This event is fired by Chromium-based browsers when the PWA install criteria are met.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
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

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export interface UsePWAInstallReturn {
  /** Whether the install prompt banner should be shown */
  canPrompt: boolean;
  /** Whether the app is already running as a standalone PWA */
  isInstalled: boolean;
  /** Whether this is iOS Safari (needs manual instructions) */
  isIOS: boolean;
  /** Trigger the native install prompt (Chrome/Edge). No-op on iOS. */
  install: () => Promise<void>;
  /** Dismiss the prompt (persists for 7 days) */
  dismiss: () => void;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setIsInstalled(true);
      return;
    }

    if (isDismissed()) return;

    // iOS Safari doesn't fire beforeinstallprompt — detect it separately
    if (isIOSSafari()) {
      setIsIOS(true);
      setCanPrompt(true);
      return;
    }

    function onBeforeInstall(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanPrompt(true);
    }

    function onAppInstalled() {
      deferredPrompt.current = null;
      setCanPrompt(false);
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }

    deferredPrompt.current = null;
    setCanPrompt(false);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setCanPrompt(false);
  }, []);

  return { canPrompt, isInstalled, isIOS, install, dismiss };
}
