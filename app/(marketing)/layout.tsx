import { Footer } from '@/components/site/Footer';
import { MarketingHeader } from '@/components/site/MarketingHeader';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-screen flex-col'>
      <MarketingHeader logoSize='xs' />
      <main className='flex-1'>{children}</main>
      <Footer />
    </div>
  );
}
