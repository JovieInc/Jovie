import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { getProfileByUsername } from '@/lib/services/profile';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { ClaimPageContent } from './ClaimPageContent';

interface Props {
  readonly params: Promise<{ readonly username: string }>;
}

export default async function ClaimPage({ params }: Props) {
  const { username } = await params;

  if (
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const profile = await getProfileByUsername(username.toLowerCase());

  if (!profile) {
    notFound();
  }

  return (
    <ClaimPageContent
      username={profile.username}
      displayName={profile.displayName ?? profile.username}
      avatarUrl={profile.avatarUrl}
      profileId={profile.id}
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
