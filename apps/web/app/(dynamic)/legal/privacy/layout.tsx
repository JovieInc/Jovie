import { LegalDocumentShell } from '../legal-document-shell';

export const revalidate = false;

export default function PrivacyLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegalDocumentShell>{children}</LegalDocumentShell>;
}
