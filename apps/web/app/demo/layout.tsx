import { Suspense } from 'react';

export const revalidate = false;

export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
