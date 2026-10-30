'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminWorkspaceTab } from '@/constants/admin-navigation';
import { cn } from '@/lib/utils';

/**
 * Route-level tabs for one operator destination (Shipping, Fleet). The
 * sidebar shows one row; the views behind it are one keystroke away here.
 */
export function OperatorRouteTabs({
  tabs,
  label,
}: Readonly<{
  readonly tabs: readonly AdminWorkspaceTab[];
  /** Accessible name, e.g. "Shipping Views". */
  readonly label: string;
}>) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      data-testid='operator-route-tabs'
      className='flex min-h-9 items-center gap-1 overflow-x-auto'
    >
      {tabs.map(tab => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-(--radius-sm) px-3 py-1.5 text-app transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              active
                ? 'bg-surface-1 font-medium text-primary-token'
                : 'text-secondary-token hover:text-primary-token'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
