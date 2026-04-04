import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

/**
 * Public /investors route redirects to the token-gated investor portal.
 * Without a valid token cookie, the middleware will return 404.
 */
export default function InvestorsPage() {
  redirect('/investor-portal');
}
