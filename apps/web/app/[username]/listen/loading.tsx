import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Listen page loading screen
 * Shows simple logo animation while processing redirect
 */
export default function ListenLoading() {
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
