import type { Metadata } from 'next';
import { MarketingContentShell } from '@/components/marketing';
import { DocPage } from '@/components/organisms/DocPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getMarkdownDocument } from '@/lib/docs/getMarkdownDocument';

const INVESTOR_MEMO_RELATIVE_PATH = 'content/investors/investor-memo.md';

export const metadata: Metadata = {
  title: `Investor Memo | ${APP_NAME}`,
  description: `Investor memo for ${APP_NAME}`,
  alternates: {
    canonical: `${APP_URL}/investors`,
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function InvestorsPage() {
  const doc = await getMarkdownDocument(INVESTOR_MEMO_RELATIVE_PATH);
  const toc = doc.toc.filter(entry => entry.level === 2);

  return (
    <MarketingContentShell>
      <DocPage
        doc={{ ...doc, toc }}
        hero={{
          eyebrow: 'Investors',
          title: 'Investor Memo',
          description: 'Jovie (Angel Round)',
        }}
        pdfTitle='Investor Memo'
      />
    </MarketingContentShell>
  );
}
