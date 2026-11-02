import { LegalDocumentShell } from '../legal-shell';

export default function PrivacyLegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LegalDocumentShell>{children}</LegalDocumentShell>;
}
