'use client';

/**
 * YouTubeEmbed — Privacy-enhanced, responsive YouTube video embed.
 *
 * Uses youtube-nocookie.com to prevent tracking cookies.
 * Uses a load timeout to detect blocked/failed embeds — iframe onerror
 * does NOT fire for cross-origin content (browser security spec).
 * If the embed hasn't loaded within the timeout, calls onError
 * so the parent can redirect instead of showing a dead page.
 */

import { useEffect, useRef, useState } from 'react';

/** How long to wait for the iframe to load before treating it as failed */
const EMBED_LOAD_TIMEOUT_MS = 8_000;

interface YouTubeEmbedProps {
  readonly videoId: string;
  readonly title: string;
  readonly className?: string;
  /** Called when the embed fails to load within the timeout */
  readonly onError?: () => void;
}

export function YouTubeEmbed({
  videoId,
  title,
  className,
  onError,
}: YouTubeEmbedProps) {
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!onError) return;

    const timer = setTimeout(() => {
      if (!loadedRef.current) {
        onError();
      }
    }, EMBED_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [onError]);

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl ${className ?? ''}`}
    >
      {!loaded && (
        <div className='absolute inset-0 animate-pulse bg-white/[0.05]' />
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe onLoad detects embed readiness for loading skeleton */}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        allowFullScreen
        loading='lazy'
        className='absolute inset-0 h-full w-full'
        onLoad={() => {
          loadedRef.current = true;
          setLoaded(true);
        }}
      />
    </div>
  );
}
