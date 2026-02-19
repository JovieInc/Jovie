import { encryptFlagValues } from 'flags';
import { FlagValues } from 'flags/react';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { homepageFlags } from '@/lib/flags';

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const values = Object.fromEntries(
    await Promise.all(homepageFlags.map(async f => [f.key, await f()] as const))
  );
  const encrypted = await encryptFlagValues(values);

  return (
    <div className='linear-marketing flex min-h-screen flex-col overflow-x-hidden bg-surface-page text-primary-token'>
      <SkipToContent />
      <MarketingHeader logoSize='xs' />
      <main
        id='main-content'
        className='flex flex-1 flex-col pt-[var(--linear-header-height)]'
      >
        {children}
      </main>
      <MarketingFooter />
      <FlagValues values={encrypted} />
    </div>
  );
}
