import { Container } from '@/components/site/Container';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

// Force dynamic rendering for all legal pages
export const dynamic = 'force-dynamic';

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-screen flex-col bg-white dark:bg-[#0a0a0b]'>
      <Header />
      <main className='flex-1 py-16 sm:py-20'>
        <Container size='lg'>{children}</Container>
      </main>
      <Footer />
    </div>
  );
}
