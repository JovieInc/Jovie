'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [canPrompt, setCanPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isStandalone);
  const isIOS =
    typeof navigator !== 'undefined' && isIOSSafari() && !isStandalone();

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    // iOS Safari doesn't fire beforeinstallprompt — detect it separately
    if (isIOSSafari()) {
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
    await prompt.userChoice;
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
