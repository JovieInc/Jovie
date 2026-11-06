export const revalidate = false;

/**
 * Pass-through segment layout. Each legal route renders LegalDocumentShell (./legal-shell.tsx)
 * from its own layout (see that component for why the shell is not hoisted
 * here).
 */
export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
