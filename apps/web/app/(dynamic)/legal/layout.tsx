import { Container } from '@/components/site/Container';
import { Footer } from '@/components/site/Footer';
import { Header } from '@/components/site/Header';

// Note: dynamic = 'force-dynamic' removed for cacheComponents compatibility
// Legal pages will still be dynamic by default

export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='flex min-h-screen flex-col bg-white dark:bg-[#0a0a0b]'>
      <Header hideNav />
      <main className='flex-1 py-16 sm:py-20'>
        <Container size='lg'>{children}</Container>
      </main>
      <Footer />
    </div>
  );
}
