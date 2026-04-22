import './home.css';
import { SkipToContent } from '@/components/atoms/SkipToContent';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='dark flex min-h-screen flex-col overflow-x-clip bg-[var(--color-bg-base)] text-primary-token'>
      <SkipToContent />
      <main id='main-content' className='flex flex-1 flex-col'>
        {children}
      </main>
    </div>
  );
}
