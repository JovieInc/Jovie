import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

// Legacy onboarding URLs redirect to /start; checkout remains under this route
// group and handles its own auth gating.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}