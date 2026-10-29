import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalSidebarNavigation,
  settingsNavItem,
  settingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import { useAuthRouteConfig } from '@/hooks/useAuthRouteConfig';

const { mockUsePathname, mockUseSearchParams } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseSearchParams: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

describe('useAuthRouteConfig', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it.each([
    ...canonicalSidebarNavigation,
    settingsNavItem,
    ...settingsNavigation,
  ])('matches the customer sidebar title for $href', item => {
    const [pathname, query] = item.href.split('?');
    mockUsePathname.mockReturnValue(pathname);
    mockUseSearchParams.mockReturnValue(new URLSearchParams(query));
    const { result } = renderHook(() => useAuthRouteConfig());
    expect(result.current.breadcrumbs).toEqual([
      { label: item.name, href: pathname },
    ]);
  });

  it.each(ADMIN_NAV_REGISTRY)(
    'matches the Ovie sidebar title for $href',
    item => {
      mockUsePathname.mockReturnValue(item.href);
      const { result } = renderHook(() => useAuthRouteConfig('ov'));
      expect(result.current.breadcrumbs).toEqual([
        { label: item.label, href: item.href },
      ]);
    }
  );

  it.each([
    ...PRODUCT_ONTOLOGY.identity.compatibilityRoutes.map(route => ({
      route,
      label: PRODUCT_ONTOLOGY.identity.label,
    })),
    ...PRODUCT_ONTOLOGY.work.compatibilityRoutes.map(route => ({
      route,
      label: PRODUCT_ONTOLOGY.work.label,
    })),
  ])(
    'uses the sidebar title for compatibility route $route',
    ({ route, label }) => {
      mockUsePathname.mockReturnValue(route);
      const { result } = renderHook(() => useAuthRouteConfig());
      expect(result.current.breadcrumbs).toEqual([{ label, href: route }]);
    }
  );

  it('uses Home for the Ovie chat alias', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.ADMIN_CHAT);
    const { result } = renderHook(() => useAuthRouteConfig('ov'));
    expect(result.current.breadcrumbs).toEqual([
      { label: 'Home', href: APP_ROUTES.ADMIN_CHAT },
    ]);
  });

  it('keeps chat detail breadcrumbs pinned to the shared chat label', () => {
    mockUsePathname.mockReturnValue('/app/chat/conv-123');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      {
        label: 'New Chat',
        href: '/app/chat/conv-123',
      },
    ]);
    expect(result.current.isChatRoute).toBe(true);
  });

  it('uses Inbox as the single shell title for the root opportunity surface', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Inbox', href: APP_ROUTES.DASHBOARD },
    ]);
  });

  it('preserves non-chat dynamic-style segments as their own label', () => {
    mockUsePathname.mockReturnValue('/app/library/thread-123');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      {
        label: 'Thread 123',
        href: '/app/library/thread-123',
      },
    ]);
    expect(result.current.section).toBe('library');
  });

  it('keeps the releases view titled with its Work sidebar root', () => {
    mockUsePathname.mockReturnValue('/app/library');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('view=releases'));

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Work', href: '/app/library' },
    ]);
  });

  it('labels the default library route as Work', () => {
    mockUsePathname.mockReturnValue('/app/library');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Work', href: '/app/library' },
    ]);
    expect(result.current.isTableRoute).toBe(true);
  });

  it('keeps other library views labeled Work', () => {
    mockUsePathname.mockReturnValue('/app/library');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('view=audio'));

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.breadcrumbs).toEqual([
      { label: 'Work', href: '/app/library' },
    ]);
  });

  it.each([APP_ROUTES.CONTACTS, APP_ROUTES.INSIGHTS])(
    'titles the %s tab with its sidebar root, Audience',
    route => {
      mockUsePathname.mockReturnValue(route);

      const { result } = renderHook(() => useAuthRouteConfig());

      expect(result.current.breadcrumbs).toEqual([
        { label: 'Audience', href: route },
      ]);
    }
  );

  it('treats the canonical tour dates route as a dashboard table surface', () => {
    mockUsePathname.mockReturnValue('/app/tour-dates');

    const { result } = renderHook(() => useAuthRouteConfig());

    expect(result.current.section).toBe('dashboard');
    expect(result.current.isTableRoute).toBe(true);
    expect(result.current.breadcrumbs).toEqual([
      { label: 'Tour dates', href: '/app/tour-dates' },
    ]);
  });

  it('uses the server-provided OV mode even when a rewrite exposes the legacy pathname', () => {
    mockUsePathname.mockReturnValue('/app/admin/ops');

    const { result } = renderHook(() => useAuthRouteConfig('ov'));

    expect(result.current.section).toBe('ov');
    expect(result.current.showMobileTabs).toBe(false);
    expect(result.current.breadcrumbs).toEqual([
      { label: 'Ops', href: '/app/admin/ops' },
    ]);
  });

  it('labels canonical Ops as an OV shell screen', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.HUD);

    const { result } = renderHook(() => useAuthRouteConfig('ov'));

    expect(result.current.section).toBe('ov');
    expect(result.current.showMobileTabs).toBe(false);
    expect(result.current.breadcrumbs).toEqual([
      { label: 'Ops', href: APP_ROUTES.HUD },
    ]);
  });

  it('keeps customer routes in customer sections', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.CHAT);

    const { result } = renderHook(() => useAuthRouteConfig('customer'));

    expect(result.current.section).toBe('dashboard');
    expect(result.current.showMobileTabs).toBe(true);
  });
});
