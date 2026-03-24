import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PROFILE_HOSTNAME } from '@/constants/domains';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

/**
 * Public /investors route redirects to the token-gated investor portal.
 * The investor memo is only accessible through investors.jov.ie with a valid token.
 */
export default function InvestorsPage() {
  redirect(`https://investors.${PROFILE_HOSTNAME}`);
}
