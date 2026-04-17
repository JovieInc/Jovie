import localFont from 'next/font/local';
import '../(home)/home.css';
import './marketing-utilities.css';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { MarketingEnhancements } from '@/features/home/MarketingEnhancements';

export const revalidate = false;

const satoshi = localFont({
  src: '../../public/fonts/Satoshi-Variable.woff2',
  variable: '--font-satoshi',
  display: 'swap',
  weight: '300 900',
});

const dmSans = localFont({
  src: '../../public/fonts/DMSans-Variable.woff2',
  variable: '--font-dm-sans',
  display: 'swap',
  weight: '400 700',
});

export default async function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PublicPageShell
      className={`dark linear-marketing overflow-x-clip bg-black text-primary-token ${satoshi.variable} ${dmSans.variable}`}
      logoSize='xs'
    >
      {children}
      <MarketingEnhancements />
      <div aria-hidden='true' className='marketing-noise' />
    </PublicPageShell>
  );
}
