import type { Metadata } from 'next';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

// No investor-specific title here: the gated 404 resolves this metadata too,
// and must not confirm that the portal exists.
export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

// Investor surfaces are per-request and private; never prerender or CDN-cache.
export const dynamic = 'force-dynamic';

/**
 * Investor portal root. The gated portal (brief, memos) lives in the (portal)
 * group, whose layout enforces access. /investor-portal/respond stays outside
 * it because email response links authenticate with their own token param.
 */
export default function InvestorPortalRootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return children;
}
