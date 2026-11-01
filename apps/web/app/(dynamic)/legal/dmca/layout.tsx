import { LegalDocumentShell } from '../legal-document-shell';

export const revalidate = false;

export default function DmcaLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegalDocumentShell>{children}</LegalDocumentShell>;
}
