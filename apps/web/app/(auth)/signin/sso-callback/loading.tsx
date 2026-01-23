import { BrandLogo } from '@/components/atoms/BrandLogo';

/**
 * SSO callback loading screen
 * Shows simple logo animation while processing OAuth callback
 */
export default function SsoCallbackLoading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <BrandLogo
        size={32}
        tone='auto'
        alt='Processing sign in...'
        priority
        className='animate-in fade-in duration-700 ease-out'
      />
    </div>
  );
}
