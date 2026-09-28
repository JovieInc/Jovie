'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { HelpNavItem } from './types';

function isActive(route: string | null, pathname: string) {
  if (!route) return false;
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}

function HelpNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: HelpNavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isActive(item.route, pathname);
  const childActive = item.children.some(child =>
    isActive(child.route, pathname)
  );

  return (
    <li className='help-nav-item'>
      {item.route ? (
        <Link
          href={item.route}
          onClick={onNavigate}
          className='help-nav-link'
          data-active={active || undefined}
          aria-current={active ? 'page' : undefined}
        >
          {item.title}
        </Link>
      ) : (
        <span
          className='help-nav-link help-nav-group'
          data-active={childActive || undefined}
        >
          {item.title}
        </span>
      )}
      {item.children.length > 0 && (
        <ul className='help-nav-list help-nav-nested'>
          {item.children.map(child => (
            <HelpNavLink
              key={child.key}
              item={child}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Shared nav tree for the desktop rail and the responsive drawer.
 * `onNavigate` lets the drawer close after following a link.
 */
export function HelpNav({
  nav,
  onNavigate,
}: {
  nav: HelpNavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '/';
  return (
    <ul className='help-nav-list'>
      {nav.map(item => (
        <HelpNavLink
          key={item.key}
          item={item}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}
