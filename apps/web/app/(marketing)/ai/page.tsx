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
 * /ai redirects to the investor portal — the 7-Method AI Operating System
 * content belongs in the investor section, not as a public marketing page.
 */
export default function AiPage() {
  redirect('/investor-portal');
}
