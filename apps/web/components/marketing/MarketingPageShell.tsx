import { cn } from '@/lib/utils';

export interface MarketingPageShellProps {
  readonly className?: string;
  readonly children: React.ReactNode;
}

/**
 * Page-level content wrapper for marketing routes. It is NOT a second page
 * shell: `PublicPageShell` (mounted by `app/(marketing)/layout.tsx`, and by
 * the homepage variant in `app/(home)/layout.tsx`) owns the header, footer,
 * skip link, viewport height, and fixed-header offset.
 *
 * JOV-4872: this wrapper must not re-apply `min-h-screen`. Nesting a
 * viewport-height box inside the shell's `flex-1` main column double-applies
 * the viewport height on top of the fixed-header offset, pushing the footer
 * below the fold by the header height on short pages. `grow` fills exactly
 * the shell's main column instead, so page-scoped backgrounds still cover
 * the full content area without adding scroll height.
 *
 * Remaining role: the named seam for page-scoped class hooks
 * (`system-b-*`, `artist-profiles-home-system`) and a `relative` positioning
 * context for decorative absolute elements.
 */
export function MarketingPageShell({
  className,
  children,
}: Readonly<MarketingPageShellProps>) {
  return <div className={cn('relative grow', className)}>{children}</div>;
}
