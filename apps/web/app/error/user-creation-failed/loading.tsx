import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * Error page loading screen
 * Shows simple logo animation while loading
 */
export default function ErrorPageLoading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <BrandLogo
        size={32}
        tone='auto'
        alt='Loading...'
        priority
        className='animate-in fade-in duration-700 ease-out'
      />
    </div>
  );
}
