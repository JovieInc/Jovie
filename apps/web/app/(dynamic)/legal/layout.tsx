export const revalidate = false;

/**
 * Pass-through segment layout. The public shell (header/footer) moved to
 * per-route layouts so /legal/privacy and /legal/terms can render the full
 * docked MarketingHeader and a route hero while /legal/cookies and
 * /legal/dmca keep the existing minimal shell unchanged
 * (ad-hoc marketing routes pass, Tim direction 2026-09-26).
 */
export default function LegalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
