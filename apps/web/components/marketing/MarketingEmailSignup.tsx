'use client';

import { usePathname } from 'next/navigation';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';

const SIGNUP_PAGES = new Set([
  '/about',
  '/support',
  '/artist-profile',
  '/artist-profiles',
  '/artist-notifications',
  '/pricing',
  '/pay',
  '/developers',
  '/launch',
  '/cli',
  '/ai',
  '/download',
  '/instant-merch',
  '/youtube-thumbnails',
]);

/** One product-update destination, with explicit consent on each public page. */
export function MarketingEmailSignup() {
  const pathname = usePathname();
  if (!pathname) return null;
  const editorial =
    pathname === '/blog' ||
    pathname.startsWith('/blog/') ||
    pathname === '/engineering' ||
    (pathname.startsWith('/engineering/') &&
      !pathname.startsWith('/engineering/preview')) ||
    pathname.startsWith('/changelog/');
  if (!editorial && !SIGNUP_PAGES.has(pathname)) return null;

  return (
    <MarketingEmailSignupSection
      key={pathname}
      source={`marketing:${pathname}`}
    />
  );
}

export function MarketingEmailSignupSection({
  source,
}: {
  readonly source: string;
}) {
  return (
    <div className='mx-auto w-full max-w-2xl px-6 py-12'>
      <ChangelogEmailSignup source={source} />
    </div>
  );
}
