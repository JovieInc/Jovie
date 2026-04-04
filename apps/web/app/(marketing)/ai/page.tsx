import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

/**
 * /ai redirects to the investor portal — the 7-Method AI Operating System
 * content belongs in the investor section, not as a public marketing page.
 */
export default function AiPage() {
  redirect('/investor-portal');
}
