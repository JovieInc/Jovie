import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';

export const revalidate = false;

export default function CookiesLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <MarketingContentShell className='public-legal-content'>
      {children}
    </MarketingContentShell>
  );
}
