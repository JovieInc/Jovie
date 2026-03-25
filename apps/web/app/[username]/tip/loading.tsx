import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Tip page loading screen
 * Shows simple logo animation while processing redirect
 */
export default function TipLoading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <BrandLogo
        size={32}
        tone='muted'
        alt='Loading...'
        className='animate-pulse animate-in fade-in duration-700 ease-out'
      />
    </div>
  );
}
