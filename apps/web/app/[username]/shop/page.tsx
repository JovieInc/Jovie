import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  buildShopRedirectUrl,
  getShopifyUrl,
} from '@/lib/profile/shop-settings';
import { getProfileWithUser } from '@/lib/services/profile';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';
import { ShopRedirectClient } from './ShopRedirectClient';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  readonly params: Promise<{ readonly username: string }>;
}

export default async function ShopPage({ params }: Readonly<Props>) {
  const { username } = await params;

  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const result = await getProfileWithUser(username.toLowerCase());

  if (!result || !result.isPublic) {
    notFound();
  }

  const settings = (result.settings as Record<string, unknown> | null) ?? {};
  const shopifyUrl = getShopifyUrl(settings);

  if (!shopifyUrl) {
    redirect(`/${username}`);
  }

  const redirectUrl = buildShopRedirectUrl(shopifyUrl, username);

  return <ShopRedirectClient redirectUrl={redirectUrl} username={username} />;
}
