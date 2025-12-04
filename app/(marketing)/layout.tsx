import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-screen flex-col'>
      <Header sticky={false} logoSize='xs' />
      <main className='flex-1'>{children}</main>
      <Footer />
    </div>
  );
}
