'use client';

import { Check, Share2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ProfileAboutShareProps {
  readonly url: string;
  readonly artistName: string;
}

export function ProfileAboutShare({
  url,
  artistName,
}: Readonly<ProfileAboutShareProps>) {
  const [shareSuccess, setShareSuccess] = useState(false);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    },
    []
  );

  const handleShare = useCallback(async () => {
    const markShared = () => {
      setShareSuccess(true);
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = setTimeout(() => setShareSuccess(false), 2000);
    };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: artistName, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      markShared();
    } catch (error) {
      // AbortError = user cancelled the share sheet, do nothing.
      if (error instanceof Error && error.name === 'AbortError') return;
      // Fallback: try the clipboard if sharing failed for another reason.
      try {
        await navigator.clipboard.writeText(url);
        markShared();
      } catch {
        // Silent failure — matches the hero share control.
      }
    }
  }, [url, artistName]);

  return (
    <button
      type='button'
      onClick={handleShare}
      className='profile-aeo-content__share inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--profile-aeo-text)'
      aria-label={
        shareSuccess
          ? `Copied link to ${artistName}'s profile`
          : `Share ${artistName}'s profile`
      }
      data-testid='profile-about-share'
    >
      {shareSuccess ? (
        <Check className='h-4 w-4' aria-hidden='true' />
      ) : (
        <Share2 className='h-4 w-4' aria-hidden='true' />
      )}
      <span aria-live='polite' className='sr-only'>
        {shareSuccess ? 'Link Copied' : ''}
      </span>
    </button>
  );
}
