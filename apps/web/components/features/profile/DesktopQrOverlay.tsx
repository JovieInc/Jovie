'use client';

import { Smartphone, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { getQrCodeUrl, QRCode } from '@/components/molecules/QRCode';
import { PROFILE_Z } from '@/lib/profile/z-index-constants';

interface DesktopQrOverlayProps {
  readonly handle: string;
}

export function DesktopQrOverlay({ handle }: Readonly<DesktopQrOverlayProps>) {
  const [mode, setMode] = useState<'hidden' | 'icon' | 'open'>('hidden');
  const [url, setUrl] = useState('');
  const qrUrl = useMemo(() => {
    if (!url) return '';
    return getQrCodeUrl(url, 120);
  }, [url]);

  useEffect(() => {
    if (!qrUrl || typeof globalThis.Image !== 'function') return;

    const preloadImage = new globalThis.Image();
    preloadImage.src = qrUrl;
  }, [qrUrl]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;

    const onOpen = () => {
      const isMdUp = globalThis.matchMedia('(min-width: 768px)').matches;
      const hasFinePointer = globalThis.matchMedia(
        '(any-pointer: fine)'
      ).matches;
      if (!isMdUp || !hasFinePointer) return;
      setMode('open');
      setUrl(`${globalThis.location.origin}/${handle}`);
    };

    globalThis.addEventListener('jovie:open-profile-qr', onOpen);
    return () => {
      globalThis.removeEventListener('jovie:open-profile-qr', onOpen);
    };
  }, [handle]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;

    const isMdUp = globalThis.matchMedia('(min-width: 768px)').matches;
    const hasFinePointer = globalThis.matchMedia('(any-pointer: fine)').matches;

    if (!isMdUp || !hasFinePointer) {
      setMode('hidden');
      setUrl('');
      return;
    }

    setMode('icon');
    setUrl(`${globalThis.location.origin}/${handle}`);
  }, [handle]);

  // React to viewport resizes: show on desktop if not dismissed, hide on mobile
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;

    const mqlMd = globalThis.matchMedia('(min-width: 768px)');
    const mqlPointer = globalThis.matchMedia('(any-pointer: fine)');

    const onChange = (_e: MediaQueryListEvent | MediaQueryList) => {
      const isMdUp = mqlMd.matches;
      const hasFinePointer = mqlPointer.matches;

      if (!isMdUp || !hasFinePointer) {
        setMode('hidden');
        setUrl('');
        return;
      }

      setMode('icon');
      setUrl(`${globalThis.location.origin}/${handle}`);
    };

    // Initial sync in case state drifted
    onChange(mqlMd);

    mqlMd.addEventListener('change', onChange);
    mqlPointer.addEventListener('change', onChange);

    return () => {
      mqlMd.removeEventListener('change', onChange);
      mqlPointer.removeEventListener('change', onChange);
    };
  }, [handle]);

  const close = () => {
    setMode('icon');
  };

  const reopen = () => {
    setMode('open');
    try {
      setUrl(`${globalThis.location.origin}/${handle}`);
    } catch (error) {
      console.error('[DesktopQrOverlay] Failed to set URL:', error);
    }
  };

  if (mode === 'hidden') return null;

  return (
    <>
      {mode === 'open' && (
        <div
          key='qr'
          className={`group fixed bottom-4 right-4 ${PROFILE_Z.DRAWER_CONTENT} flex flex-col items-center overflow-hidden rounded-xl bg-surface-0 p-3 shadow-xl ring-1 ring-(--color-border-subtle) backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-cinematic ease-out motion-reduce:animate-none`}
        >
          <div className='pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-slower group-hover:opacity-100'>
            <div className='absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]' />
          </div>
          <div className='relative mb-1 flex w-full items-center justify-between gap-2'>
            <p className='pl-1 text-xs font-medium text-secondary-token'>
              Open On Phone
            </p>
            <button
              type='button'
              onClick={close}
              aria-label='Close'
              className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </button>
          </div>
          {url && (
            <QRCode
              data={url}
              size={120}
              label='Scan To Open This Profile On Your Phone'
            />
          )}
        </div>
      )}

      {mode === 'icon' && (
        <div
          key='reopen'
          className={`fixed bottom-4 right-4 ${PROFILE_Z.DRAWER_CONTENT} animate-in fade-in slide-in-from-bottom-3 duration-cinematic ease-out motion-reduce:animate-none`}
        >
          <CircleIconButton
            size='lg'
            variant='surface'
            onClick={reopen}
            ariaLabel='Open On Phone'
            className='group backdrop-blur-sm'
          >
            <span className='pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-slower group-hover:opacity-100 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.35),transparent_60%)]' />
            <Smartphone className='relative h-5 w-5' aria-hidden='true' />
          </CircleIconButton>
        </div>
      )}
    </>
  );
}

export default DesktopQrOverlay;
