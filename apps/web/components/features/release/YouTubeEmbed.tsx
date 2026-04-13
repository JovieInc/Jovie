'use client';

/**
 * YouTubeEmbed — Privacy-enhanced, responsive YouTube video embed.
 *
 * Uses youtube-nocookie.com to prevent tracking cookies.
 * On load failure, calls onError so the parent can redirect
 * instead of showing a dead embed.
 */

import { useState } from 'react';

interface YouTubeEmbedProps {
  readonly videoId: string;
  readonly title: string;
  readonly className?: string;
  /** Called when the iframe fails to load (network error, blocked by browser) */
  readonly onError?: () => void;
}

export function YouTubeEmbed({
  videoId,
  title,
  className,
  onError,
}: YouTubeEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl ${className ?? ''}`}
    >
      {!loaded && (
        <div className='absolute inset-0 animate-pulse bg-white/[0.05]' />
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe onLoad/onError is standard HTML for detecting embed state */}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        allowFullScreen
        loading='lazy'
        className='absolute inset-0 h-full w-full'
        onLoad={() => setLoaded(true)}
        onError={() => onError?.()}
      />
    </div>
  );
}
