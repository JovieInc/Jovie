import { Disc3 } from 'lucide-react';
import {
  getArtworkFallbackAccentStyle,
  getArtworkFallbackSurfaceStyle,
} from '@/lib/artwork-fallback';
import { cn } from '@/lib/utils';

interface ArtworkFallbackTileProps {
  readonly seed: string;
  readonly label?: string;
  readonly className?: string;
  readonly iconClassName?: string;
  readonly accentClassName?: string;
}

/**
 * Tokenized fallback cover art used anywhere shell artwork is missing.
 * Keep this quiet and deterministic so missing artwork reads as intentional UI.
 */
export function ArtworkFallbackTile({
  seed,
  label,
  className,
  iconClassName = 'h-[42%] w-[42%]',
  accentClassName = 'h-1',
}: ArtworkFallbackTileProps) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden text-white/25',
        className
      )}
      data-artwork-fallback='true'
      style={getArtworkFallbackSurfaceStyle(seed)}
    >
      <Disc3
        aria-hidden='true'
        className={cn('relative z-10', iconClassName)}
        data-artwork-fallback-icon='true'
        strokeWidth={1.85}
      />
      <span
        aria-hidden='true'
        className={cn('absolute inset-x-0 bottom-0', accentClassName)}
        style={getArtworkFallbackAccentStyle(seed)}
      />
      <span
        aria-hidden='true'
        className='absolute inset-[1px] rounded-[3px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
      />
      {label ? <span className='sr-only'>{label}</span> : null}
    </div>
  );
}
