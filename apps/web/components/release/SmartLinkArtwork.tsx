import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';

interface SmartLinkArtworkProps {
  readonly src: string | null;
  readonly alt: string;
}

/**
 * Album artwork for smart link pages, sized to match the profile avatar (224px / size-56).
 * This ensures visual consistency and eliminates layout shift between profile and release pages.
 */
export function SmartLinkArtwork({ src, alt }: SmartLinkArtworkProps) {
  return (
    <div className='flex justify-center'>
      <div className='relative size-56 overflow-hidden rounded-[20px] bg-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/10'>
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            className='object-cover'
            sizes='224px'
            priority
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <Icon
              name='Disc3'
              className='h-16 w-16 text-white/20'
              aria-hidden='true'
            />
          </div>
        )}
      </div>
    </div>
  );
}
