// @coverage-via apps/web/tests/unit/auth/AuthProviderButtons.test.tsx
import type { PrimaryAuthOAuthProvider } from '@/lib/auth/oauth-providers';
import { getAuthOAuthProviderLabel } from '@/lib/auth/oauth-providers';
import { cn } from '@/lib/utils';
import { AuthAppleIcon, AuthGoogleIcon } from './atoms';

interface AuthProviderButtonSlotProps {
  readonly provider: PrimaryAuthOAuthProvider;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly pending?: boolean;
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

/**
 * Provider buttons are the only branded exceptions on the auth form.
 * Apple and Google share one dark, 28/44 treatment so they read as a pair.
 */
const AUTH_PROVIDER_BUTTON_CLASS = cn(
  'relative flex h-7 min-h-7 w-full items-center justify-center gap-(--space-2) rounded-full border border-white/10 bg-transparent px-(--space-4) text-sm font-[510] tracking-normal text-primary-token',
  'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out',
  'hover:bg-white/[0.04]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
);

export function AuthProviderButtonSlot({
  provider,
  disabled = true,
  onClick,
  pending = false,
}: Readonly<AuthProviderButtonSlotProps>) {
  const label = getAuthOAuthProviderLabel(provider);
  const isDisabled = disabled || pending;

  return (
    <button
      type='button'
      disabled={isDisabled}
      aria-label={isDisabled ? `${label} loading` : undefined}
      data-auth-provider-slot={provider}
      data-auth-provider-pending={pending ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        AUTH_PROVIDER_BUTTON_CLASS,
        isDisabled && 'cursor-wait opacity-75'
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
      className='grid grid-cols-1 gap-3'
      aria-busy='true'
    >
      <legend className='sr-only'>Loading social sign-in options</legend>
      {providers.map(provider => (
        <AuthProviderButtonSlot key={provider} provider={provider} />
      ))}
    </fieldset>
  );
}
