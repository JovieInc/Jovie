'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Download, Share2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { track } from '@/lib/analytics';

interface CelebrationCardPreviewProps {
  readonly username: string;
  /** Called when user interacts with any button (download, share, copy). */
  readonly onInteraction?: () => void;
}

type CardSize = 'feed' | 'story';

const SIZE_LABELS: Record<CardSize, string> = {
  feed: 'Square (1080×1080)',
  story: 'Story (1080×1920)',
};

function getCardUrl(username: string, size: CardSize, download?: boolean) {
  const params = new URLSearchParams({ size });
  if (download) params.set('download', '1');
  return `/api/celebration-card/${username}?${params}`;
}

export function CelebrationCardPreview({
  username,
  onInteraction,
}: CelebrationCardPreviewProps) {
  const [selectedSize, setSelectedSize] = useState<CardSize>('feed');
  const [isDownloading, setIsDownloading] = useState(false);
  const cardUrl = getCardUrl(username, selectedSize);

  const handleDownload = useCallback(async () => {
    onInteraction?.();
    setIsDownloading(true);
    try {
      const response = await fetch(getCardUrl(username, selectedSize, true));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jovie-${username}-${selectedSize}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      track('celebration_card_downloaded', { username, size: selectedSize });
    } catch {
      // Silently fail — user can still copy URL or share
    } finally {
      setIsDownloading(false);
    }
  }, [username, selectedSize, onInteraction]);

  const handleShare = useCallback(async () => {
    onInteraction?.();
    try {
      // Try sharing with the image file first
      const response = await fetch(getCardUrl(username, selectedSize));
      const blob = await response.blob();
      const file = new File([blob], `jovie-${username}.png`, {
        type: 'image/png',
      });

      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: `${username} on Jovie`,
          url: `https://jov.ie/${username}`,
        });
      } else {
        // Fall back to URL-only share
        await navigator.share({
          title: `${username} on Jovie`,
          url: `https://jov.ie/${username}`,
        });
      }
      track('celebration_card_shared', { username, size: selectedSize });
    } catch {
      // User cancelled share sheet or share failed — no-op
    }
  }, [username, selectedSize, onInteraction]);

  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className='flex flex-col items-center gap-4'>
      {/* Size picker */}
      <div className='flex gap-2'>
        {(Object.keys(SIZE_LABELS) as CardSize[]).map(size => (
          <button
            key={size}
            type='button'
            onClick={() => {
              setSelectedSize(size);
              onInteraction?.();
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedSize === size
                ? 'bg-primary-token text-on-primary'
                : 'bg-surface-2 text-secondary-token hover:text-primary-token'
            }`}
          >
            {SIZE_LABELS[size]}
          </button>
        ))}
      </div>

      {/* Card preview */}
      <div
        className={`overflow-hidden rounded-xl border border-subtle shadow-lg ${
          selectedSize === 'story' ? 'max-h-[320px]' : 'max-h-[240px]'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- preview of generated image */}
        <img
          src={cardUrl}
          alt='Your shareable profile card'
          className={`w-full ${
            selectedSize === 'story' ? 'max-w-[180px]' : 'max-w-[240px]'
          }`}
        />
      </div>

      {/* Action buttons */}
      <div className='flex gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={handleDownload}
          disabled={isDownloading}
        >
          <Download className='mr-1.5 h-3.5 w-3.5' />
          {isDownloading ? 'Downloading…' : 'Download'}
        </Button>

        {canShare && (
          <Button variant='outline' size='sm' onClick={handleShare}>
            <Share2 className='mr-1.5 h-3.5 w-3.5' />
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
