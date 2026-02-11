import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import {
  getProfileByUsername,
  isClaimTokenValid,
} from '@/lib/services/profile';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { ClaimPageContent } from './ClaimPageContent';

interface Props {
  readonly params: Promise<{ readonly username: string }>;
  readonly searchParams?: Promise<{ token?: string }>;
}

export default async function ClaimPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams?.token;

  // Validate username format
  if (
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  // Token is required
  if (!token || token.length === 0) {
    notFound();
  }

  const normalizedUsername = username.toLowerCase();

  // Validate claim token and fetch profile in parallel
  const [isValid, profile] = await Promise.all([
    isClaimTokenValid(normalizedUsername, token),
    getProfileByUsername(normalizedUsername),
  ]);

  if (!isValid || !profile) {
    notFound();
  }

  return (
    <ClaimPageContent
      username={profile.username}
      displayName={profile.displayName ?? profile.username}
      avatarUrl={profile.avatarUrl}
      claimToken={token}
    />
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Claim Your Profile - @${username}`,
    robots: { index: false, follow: false },
    alternates: { canonical: `${BASE_URL}/${username}` },
    other: { referrer: 'no-referrer' },
  };
}
