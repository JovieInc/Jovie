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
        'relative flex h-full w-full items-center justify-center overflow-hidden text-white/40',
        className
      )}
      data-artwork-fallback='true'
      style={getArtworkFallbackSurfaceStyle(seed)}
    >
      <span
        aria-hidden='true'
        className='absolute inset-[8%] rounded-[7%] border border-white/[0.07] bg-[linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.012)_52%,rgba(0,0,0,0.13))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-24px_48px_rgba(0,0,0,0.14)]'
        data-artwork-fallback-sleeve='true'
      />
      <Disc3
        aria-hidden='true'
        className={cn(
          'relative z-10 drop-shadow-[0_8px_28px_rgba(0,0,0,0.28)]',
          iconClassName
        )}
        data-artwork-fallback-icon='true'
        strokeWidth={2.1}
      />
      <span
        aria-hidden='true'
        className={cn('absolute inset-x-0 bottom-0 z-10', accentClassName)}
        style={getArtworkFallbackAccentStyle(seed)}
      />
      <span
        aria-hidden='true'
        className='absolute inset-[1px] rounded-[3px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
      />
      {label ? <span className='sr-only'>{label}</span> : null}
    </div>
  );
}
