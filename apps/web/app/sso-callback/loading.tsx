import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';

/**
 * SSO callback loading screen
 * Shows simple logo animation while processing OAuth callback
 */
export default function SsoCallbackLoading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <JovieMarkElectric size={32} />
    </div>
  );
}
