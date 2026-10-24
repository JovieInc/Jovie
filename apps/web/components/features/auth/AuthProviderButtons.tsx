// @coverage-via apps/web/tests/unit/auth/AuthProviderButtons.test.tsx
import { SocialAuthButton } from '@/components/atoms/SocialAuthButton';
import type { PrimaryAuthOAuthProvider } from '@/lib/auth/oauth-providers';

// Compatibility name keeps existing auth entry points on the same atom.
export { SocialAuthButton as AuthProviderButtonSlot } from '@/components/atoms/SocialAuthButton';

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
        <SocialAuthButton key={provider} provider={provider} />
      ))}
    </fieldset>
  );
}
