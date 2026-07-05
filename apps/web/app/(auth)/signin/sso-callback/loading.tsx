import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

/**
 * SSO callback loading screen
 * Shows spinner with status text while processing OAuth callback
 */
export default function SsoCallbackLoading() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <div className='flex flex-col items-center gap-4 animate-in fade-in duration-cinematic ease-out'>
        <LoadingSpinner size='md' tone='muted' label='Signing You In' />
        <p className='text-app text-tertiary-token'>Signing You In…</p>
      </div>
    </div>
  );
}
