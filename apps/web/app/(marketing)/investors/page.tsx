import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Public /investors route redirects to the token-gated investor portal.
 * Without a valid token cookie, the middleware will return 404.
 */
export default function InvestorsPage() {
  redirect('/investor-portal');
}
