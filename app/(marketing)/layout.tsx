import { MarketingFooter } from '@/components/site/MarketingFooter';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='marketing-mono flex h-full flex-col overflow-y-auto'>
      <MarketingHeader logoSize='xs' />
      <main className='flex-1'>{children}</main>
      <MarketingFooter />
    </div>
  );
}
