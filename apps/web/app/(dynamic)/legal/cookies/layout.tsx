import { LegalDocumentShell } from '../legal-shell';

export const revalidate = false;

export default function CookiesLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegalDocumentShell>{children}</LegalDocumentShell>;
}
