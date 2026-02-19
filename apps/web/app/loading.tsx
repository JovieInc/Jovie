import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Root loading screen — shown on initial page load before any layout mounts.
 * Uses design system tokens for consistent theming.
 */
export default function Loading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <div className='flex flex-col items-center gap-3'>
        <BrandLogo
          size={32}
          tone='auto'
          alt='Loading'
          priority
          className='animate-in fade-in duration-700 ease-out'
        />
        <p className='text-xs text-tertiary-token animate-in fade-in duration-1000 delay-500'>
          Loading...
        </p>
      </div>
    </div>
  );
}
