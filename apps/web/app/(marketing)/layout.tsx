import { encryptFlagValues } from 'flags';
import { FlagValues } from 'flags/react';
import { SkipToContent } from '@/components/atoms/SkipToContent';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { homepageFlagDefaults } from '@/lib/flags';

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use static defaults instead of evaluating flag() functions which call
  // cookies()/headers() and force the entire marketing layout into dynamic rendering.
  const encrypted = await encryptFlagValues(homepageFlagDefaults);

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
