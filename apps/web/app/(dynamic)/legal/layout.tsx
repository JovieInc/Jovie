import { PublicPageShell } from '@/components/site/PublicPageShell';

export const revalidate = false;

/** All public legal documents and their loading/error boundaries share chrome. */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicPageShell
      className='public-legal-shell bg-base text-primary-token'
      footerVariant='expanded'
      logoSize='sm'
    >
      {children}
    </PublicPageShell>
  );
}
