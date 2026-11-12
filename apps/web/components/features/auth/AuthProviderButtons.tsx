import { PlainButton } from '@jovie/ui';
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
 * Pen oaz9c ghost pills: a 28px hairline pill inside a 44px tap target, mono
 * Apple glyph, Google's own G (its branding rules keep the G in color).
 * Shared geometry and type live in styles/theme.css.
 */
const AUTH_PROVIDER_BUTTON_CLASS = cn(
  'auth-provider-button w-full',
  'transition-opacity duration-subtle ease-out'
);

function AppleGlyph() {
  return (
    <svg
      viewBox='0 0 24 24'
      width={16}
      height={16}
      aria-hidden='true'
      focusable='false'
      fill='currentColor'
    >
      <path d='M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701' />
    </svg>
  );
}

export function AuthProviderButtonSlot({
  provider,
  disabled = true,
  onClick,
  pending = false,
}: Readonly<AuthProviderButtonSlotProps>) {
  const label = getAuthOAuthProviderLabel(provider);
  const isDisabled = disabled || pending;

  return (
    <PlainButton
      type='button'
      disabled={isDisabled}
      aria-label={pending ? `${label} loading` : undefined}
      data-auth-provider-slot={provider}
      data-auth-provider-pending={pending ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        AUTH_PROVIDER_BUTTON_CLASS,
        pending && 'cursor-wait opacity-75'
      )}
    >
      <span data-auth-provider-face className='auth-provider-face'>
        {provider === 'apple' ? (
          <AppleGlyph />
        ) : (
          <Image
            src={`/auth/${provider}-logo.svg`}
            width={16}
            height={16}
            alt=''
            aria-hidden='true'
            unoptimized
          />
        )}
        <span>{label}</span>
      </span>
    </PlainButton>
  );
}

export function AuthProviderButtonSlots({
  providers,
}: Readonly<{ providers: readonly PrimaryAuthOAuthProvider[] }>) {
  return (
    <fieldset
      data-auth-provider-slots
      className='grid grid-cols-1 gap-1'
      aria-busy='true'
    >
      <legend className='sr-only'>Loading social sign-in options</legend>
      {providers.map(provider => (
        <AuthProviderButtonSlot key={provider} provider={provider} />
      ))}
    </fieldset>
  );
}
