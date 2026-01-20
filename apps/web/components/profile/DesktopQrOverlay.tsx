'use client';

import { motion } from 'framer-motion';
import { Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { QRCode } from '@/components/atoms/QRCode';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

interface DesktopQrOverlayProps {
  handle: string;
}

export function DesktopQrOverlay({ handle }: Readonly<DesktopQrOverlayProps>) {
  const [mode, setMode] = useState<'hidden' | 'icon' | 'open'>('hidden');
  const [dismissed, setDismissed] = useState(false);
  const [url, setUrl] = useState('');
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onOpen = () => {
      const isMdUp = window.matchMedia('(min-width: 768px)').matches;
      if (!isMdUp) return;
      setDismissed(false);
      setMode('open');
      setUrl(`${window.location.origin}/${handle}`);
    };

    window.addEventListener('jovie:open-profile-qr', onOpen);
    return () => {
      window.removeEventListener('jovie:open-profile-qr', onOpen);
    };
  }, [handle]);

  useEffect(() => {
    const isMdUp = window.matchMedia('(min-width: 768px)').matches;
    const isLgUp = window.matchMedia('(min-width: 1024px)').matches;
    const hasDismissed =
      localStorage.getItem('viewOnMobileDismissed') === 'true';

    setDismissed(hasDismissed);

    if (!isMdUp) {
      setMode('hidden');
      setUrl('');
      return;
    }

    if (isLgUp && !hasDismissed) {
      setMode('open');
      setUrl(`${window.location.origin}/${handle}`);
      return;
    }

    setMode('icon');
    setUrl('');
  }, [handle]);

  // React to viewport resizes: show on desktop if not dismissed, hide on mobile
  useEffect(() => {
    const mqlMd = window.matchMedia('(min-width: 768px)');
    const mqlLg = window.matchMedia('(min-width: 1024px)');

    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      void e;
      const isMdUp = mqlMd.matches;
      const isLgUp = mqlLg.matches;

      if (!isMdUp) {
        setMode('hidden');
        setUrl('');
        return;
      }

      if (isLgUp && !dismissed) {
        setMode('open');
        setUrl(`${window.location.origin}/${handle}`);
        return;
      }

      setMode('icon');
      setUrl('');
    };

    // Initial sync in case state drifted
    onChange(mqlMd);

    // Add listener with both modern and legacy APIs (feature detection)
    type LegacyMQL = MediaQueryList & {
      addListener?: (
        listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void
      ) => void;
      removeListener?: (
        listener: (this: MediaQueryList, ev: MediaQueryListEvent) => void
      ) => void;
    };
    const legacyMqlMd = mqlMd as LegacyMQL;
    const legacyMqlLg = mqlLg as LegacyMQL;

    if (typeof mqlMd.addEventListener === 'function') {
      mqlMd.addEventListener('change', onChange as EventListener);
      mqlLg.addEventListener('change', onChange as EventListener);
    } else if (typeof legacyMqlMd.addListener === 'function') {
      legacyMqlMd.addListener(
        onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void
      );
      legacyMqlLg.addListener(
        onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void
      );
    }

    return () => {
      if (typeof mqlMd.removeEventListener === 'function') {
        mqlMd.removeEventListener('change', onChange as EventListener);
        mqlLg.removeEventListener('change', onChange as EventListener);
      } else if (typeof legacyMqlMd.removeListener === 'function') {
        legacyMqlMd.removeListener(
          onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void
        );
        legacyMqlLg.removeListener(
          onChange as (this: MediaQueryList, ev: MediaQueryListEvent) => void
        );
      }
    };
  }, [dismissed, handle]);

  const close = () => {
    // Clear URL first so the <img> disappears immediately, even during exit animation
    setUrl('');
    setMode('icon');
    setDismissed(true);
    localStorage.setItem('viewOnMobileDismissed', 'true');
  };

  const reopen = () => {
    setMode('open');
    try {
      setUrl(`${window.location.origin}/${handle}`);
    } catch (error) {
      console.error('[DesktopQrOverlay] Failed to set URL:', error);
    }
  };

  if (mode === 'hidden') return null;

  return (
    <>
      {mode === 'open' && (
        <motion.div
          key='qr'
          initial={
            prefersReducedMotion
              ? { opacity: 1 }
              : { opacity: 0, y: 16, scale: 0.98 }
          }
          animate={
            prefersReducedMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, scale: 1 }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.2, ease: 'easeOut' }
          }
          className='group fixed bottom-4 right-4 z-50 flex flex-col items-center rounded-xl p-4 ring-1 ring-(--color-border-subtle) shadow-xl bg-surface-0 backdrop-blur-md overflow-hidden'
        >
          <div className='pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
            <div className='absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]' />
          </div>
          <button
            type='button'
            onClick={close}
            aria-label='Close'
            className='absolute top-1 right-1 text-tertiary-token hover:text-secondary-token'
          >
            <X className='h-4 w-4' />
          </button>
          {url && (
            <QRCode data={url} size={120} label='Scan to view on mobile' />
          )}
          <p className='mt-2 text-xs text-secondary-token'>View on mobile</p>
        </motion.div>
      )}

      {mode === 'icon' && (
        <motion.div
          key='reopen'
          initial={
            prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 }
          }
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.2, ease: 'easeOut' }
          }
          className='fixed bottom-4 right-4 z-50'
        >
          <CircleIconButton
            size='md'
            variant='surface'
            onClick={reopen}
            ariaLabel='View on mobile'
            className='group backdrop-blur-sm'
          >
            <span className='pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]' />
            <Smartphone className='relative h-5 w-5' aria-hidden='true' />
          </CircleIconButton>
        </motion.div>
      )}
    </>
  );
}

export default DesktopQrOverlay;
