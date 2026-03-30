import type { Metadata } from 'next';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { InvestorLinksManager } from './InvestorLinksManager';

export const metadata: Metadata = {
  title: 'Investor Links',
};

/**
 * Admin investor links management page.
 * Create new links, copy URLs, toggle active/inactive.
 */
export default function InvestorLinksPage() {
  return (
    <PageShell>
      <PageContent>
        <h1 className='sr-only'>Manage investor links</h1>
        <InvestorLinksManager />
      </PageContent>
    </PageShell>
  );
}
