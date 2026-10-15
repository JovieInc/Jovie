// @coverage-via apps/web/tests/unit/auth/AuthProviderButtons.test.tsx
import Image from 'next/image';
import type { PrimaryAuthOAuthProvider } from '@/lib/auth/oauth-providers';
import { getAuthOAuthProviderLabel } from '@/lib/auth/oauth-providers';
import { cn } from '@/lib/utils';

interface AuthProviderButtonSlotProps {
  readonly provider: PrimaryAuthOAuthProvider;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly pending?: boolean;
}

/**
 * Provider buttons are the only branded exceptions on the auth form.
 * Official artwork and provider-specific treatments live in the shared theme.
 * See docs/auth/provider-button-treatments.md for provenance and geometry proof.
 */
const AUTH_PROVIDER_BUTTON_CLASS = cn(
  'auth-provider-button focus-ring-themed w-full',
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out',
  'enabled:hover:opacity-90'
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
      <Image
        src={`/auth/${provider}-logo.svg`}
        width={provider === 'apple' ? 24 : 20}
        height={provider === 'apple' ? 44 : 20}
        alt=''
        aria-hidden='true'
        unoptimized
      />
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
