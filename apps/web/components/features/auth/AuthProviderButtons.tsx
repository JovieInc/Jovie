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
        'flex h-(--linear-button-height-md) min-h-(--linear-button-height-md) w-full items-center justify-center gap-(--linear-gap-buttons) rounded-full border px-(--linear-space-4) text-caption font-caption tracking-normal',
        'transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/40',
        isDisabled && 'cursor-wait opacity-75',
        provider === 'google'
          ? 'border-(--linear-btn-primary-border) bg-(--linear-btn-primary-bg) text-(--linear-btn-primary-fg) shadow-(--linear-shadow-button) hover:bg-(--linear-btn-primary-hover)'
          : 'border-subtle bg-surface-1 text-primary-token hover:border-default hover:bg-surface-0'
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
