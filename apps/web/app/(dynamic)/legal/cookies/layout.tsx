import { LegalDocumentShell } from '../legal-shell';

export default function CookiesLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegalDocumentShell>{children}</LegalDocumentShell>;
}
