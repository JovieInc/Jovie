import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getSidebarRouteLabel } from './sidebar-route-labels';

const shellRoot = resolve(import.meta.dirname, '../../app/app/(shell)');

describe('sidebar page title source contract', () => {
  it.each(ADMIN_NAV_REGISTRY)(
    'derives $href metadata from its sidebar entry',
    item => {
      const relativePath =
        item.href === APP_ROUTES.OV
          ? 'admin/chat/page.tsx'
          : `${item.href.replace('/app/ov/', 'admin/')}/page.tsx`;
      const source = readFileSync(resolve(shellRoot, relativePath), 'utf8');
      const binding = source.match(
        /title:\s*getSidebarRouteLabel\(APP_ROUTES\.(\w+),\s*'ov'\)/
      );
      expect(
        binding,
        `${relativePath} must derive its title from the route list`
      ).not.toBeNull();
      const route = APP_ROUTES[binding?.[1] as keyof typeof APP_ROUTES];
      expect(route).toBe(item.href);
      expect(getSidebarRouteLabel(route, 'ov')).toBe(item.label);
      expect(source).toContain("from '@/lib/constants/sidebar-route-labels'");
    }
  );

  it('leaves the Identity toolbar title slot empty so the shell owns its heading', () => {
    const source = readFileSync(
      resolve(shellRoot, 'profiles/ProfilesWorkspace.tsx'),
      'utf8'
    );
    expect(source).toContain('start={null}');
    expect(source).not.toMatch(/<span[^>]*>\s*Profiles\s*<\/span>/);
  });

  it.each([
    [
      'page.tsx',
      'homeNavItem',
      'title: DASHBOARD_TITLE',
      'const DASHBOARD_TITLE = homeNavItem.name;',
    ],
    ['presence/page.tsx', 'presenceNavItem', 'title: presenceNavItem.name'],
    ['library/page.tsx', 'libraryNavItem', 'title: libraryNavItem.name'],
    ['contacts/page.tsx', 'audienceNavItem', 'title: audienceNavItem.name'],
  ])(
    'derives %s metadata from the customer sidebar entry',
    (path, item, ...bindings) => {
      const source = readFileSync(resolve(shellRoot, path), 'utf8');
      expect(source).toContain(item);
      expect(source).toContain(
        "from '@/components/features/dashboard/dashboard-nav/config'"
      );
      for (const binding of bindings) expect(source).toContain(binding);
    }
  );
});
