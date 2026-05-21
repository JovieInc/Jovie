import type { PrimaryAuthOAuthProvider } from '@/lib/auth/oauth-providers';
import { getAuthOAuthProviderLabel } from '@/lib/auth/oauth-providers';
import { cn } from '@/lib/utils';
import { AuthAppleIcon, AuthGoogleIcon } from './atoms';

interface AuthProviderButtonSlotProps {
  readonly provider: PrimaryAuthOAuthProvider;
  readonly disabled?: boolean;
}

function AuthProviderIcon({
  provider,
}: Readonly<{ provider: PrimaryAuthOAuthProvider }>) {
  const className = 'h-5 w-5 shrink-0';

  if (provider === 'google') {
    return <AuthGoogleIcon className={className} />;
  }

  return <AuthAppleIcon className={className} />;
}

export function AuthProviderButtonSlot({
  provider,
  disabled = true,
}: Readonly<AuthProviderButtonSlotProps>) {
  const label = getAuthOAuthProviderLabel(provider);

  return (
    <button
      type='button'
      disabled={disabled}
      aria-label={disabled ? `${label} loading` : undefined}
      data-auth-provider-slot={provider}
      className={cn(
        'flex h-10 min-h-10 w-full items-center justify-center gap-2 rounded-full border px-4 text-[0.875rem] font-semibold tracking-[-0.011em]',
        'transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        disabled && 'cursor-wait',
        provider === 'google'
          ? 'border-white/15 bg-white text-[#06070a]'
          : 'border-white/[0.08] bg-white/[0.045] text-white'
      )}
    >
      <AuthProviderIcon provider={provider} />
      <span>{label}</span>
    </button>
  );
}

export function AuthProviderButtonSlots({
  providers,
}: Readonly<{ providers: readonly PrimaryAuthOAuthProvider[] }>) {
  return (
    <fieldset
      data-auth-provider-slots
      className='grid grid-cols-1 gap-1.5'
      aria-busy='true'
    >
      <legend className='sr-only'>Loading social sign-in options</legend>
      {providers.map(provider => (
        <AuthProviderButtonSlot key={provider} provider={provider} />
      ))}
    </fieldset>
  );
}
