import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Root loading screen — shown on initial page load before any layout mounts.
 * Mobile-first sizing with larger touch-friendly base logo and progressive scaling.
 */
export default function Loading() {
  return (
    <div className='grid min-h-dvh place-items-center bg-base px-6'>
      <div className='flex flex-col items-center gap-3 sm:gap-4'>
        <BrandLogo
          size={48}
          tone='auto'
          alt='Loading'
          priority
          className='h-12 w-12 animate-in fade-in duration-700 ease-out sm:h-14 sm:w-14 md:h-16 md:w-16'
        />
        <p className='animate-in fade-in text-sm text-tertiary-token duration-1000 delay-500 sm:text-base'>
          Loading...
        </p>
      </div>
    </div>
  );
}
