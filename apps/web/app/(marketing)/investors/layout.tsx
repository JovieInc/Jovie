/**
 * Investors layout — pass-through for now.
 *
 * The shared marketing layout already renders MarketingHeader with the default
 * 'landing' variant. A future iteration could override it with variant='minimal'
 * by rendering a separate header here, but that would require suppressing the
 * parent header which isn't currently supported without changes to the shared layout.
 */
export const revalidate = false;

export default function InvestorsLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return children;
}
