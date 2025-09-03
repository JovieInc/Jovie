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
    <div className='flex min-h-screen flex-col bg-[#0D0E12]'>
      <Header />
      <main className='flex-1 py-12'>
        <Container size='xl'>{children}</Container>
      </main>
      <Footer />
    </div>
  );
}
