'use client';

import { PlatformPill } from '@/features/dashboard/atoms/PlatformPill';

interface SpotifyAccountIdentityProps {
  readonly displayName?: string | null;
  readonly handle?: string | null;
  readonly accountId?: string | null;
  readonly href?: string | null;
  readonly className?: string;
}

export function getSpotifyAccountLabel({
  displayName,
  handle,
  accountId,
}: Pick<
  SpotifyAccountIdentityProps,
  'displayName' | 'handle' | 'accountId'
>): string {
  const name = displayName?.trim();
  if (name) return name;
  const normalizedHandle = handle?.trim().replace(/^@/, '');
  if (normalizedHandle) return `@${normalizedHandle}`;
  return accountId?.trim() || 'Spotify account';
}

/** One account identity treatment for Spotify across rows, cards, and rails. */
export function SpotifyAccountIdentity({
  displayName,
  handle,
  accountId,
  href,
  className,
}: SpotifyAccountIdentityProps) {
  const label = getSpotifyAccountLabel({ displayName, handle, accountId });

  return (
    <PlatformPill
      platformIcon='spotify'
      platformName='Spotify'
      primaryText={label}
      onClick={
        href
          ? () => globalThis.open(href, '_blank', 'noopener,noreferrer')
          : undefined
      }
      className={className}
      testId='spotify-account-identity'
    />
  );
}
