import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { UnifiedSidebar } from '@/components/organisms/UnifiedSidebar';
import { APP_ROUTES } from '@/constants/routes';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { ShellSidebarOverrideProvider } from '@/contexts/ShellSidebarOverrideContext';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

/**
 * Sidebar header row guard (Tim, 2026-11-14 screenshot of jov.ie/app):
 * the bell's focus ring was clipped by the staged header cluster's
 * `overflow-hidden`, and the bell, search and rail toggle used three
 * different box, radius, icon and hit-area treatments.
 *
 * jsdom has no Tailwind stylesheet, so these assertions read the class
 * contract. The browser half (real ring rects vs. clipping ancestors) lives
 * in tests/e2e/utils/focus-ring-clipping.ts.
 */

vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => APP_ROUTES.DASHBOARD,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/desktop/electron-bridge')>()),
  isElectronRuntime: () => false,
  useIsElectronRuntime: () => false,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ signOut: vi.fn() }),
}));

vi.mock('@/features/dashboard/dashboard-nav', () => ({
  DashboardNav: ({ children }: { readonly children?: ReactNode }) => (
    <div data-testid='dashboard-nav'>{children}</div>
  ),
}));

vi.mock('@/components/organisms/user-button', () => ({
  UserButton: () => <div data-testid='user-button' />,
}));

vi.mock('@/components/organisms/SidebarDockBridge', () => ({
  SidebarDockBridge: (props: {
    readonly children: (status: undefined) => ReactNode;
  }) => <>{props.children(undefined)}</>,
}));

const dashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
} as unknown as DashboardData;

function renderHeader({
  open = true,
  data,
}: {
  readonly open?: boolean;
  readonly data?: Partial<DashboardData>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
        <DashboardDataProvider value={{ ...dashboardData, ...data }}>
          <HeaderActionsProvider>
            <TooltipProvider>
              <SidebarProvider defaultOpen={open}>
                <ShellSidebarOverrideProvider>
                  <UnifiedSidebar
                    section='dashboard'
                    headerOwnsCollapsedToggle
                  />
                </ShellSidebarOverrideProvider>
              </SidebarProvider>
            </TooltipProvider>
          </HeaderActionsProvider>
        </DashboardDataProvider>
      </AppFlagProvider>
    </QueryClientProvider>
  );
}

function tokens(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

/** Variant prefixes that are always on at desktop widths (or unconditional). */
const ALWAYS_ON_PREFIX = /^(?:(?:sm|md|lg|xl|2xl):)*$/;

function activeTokens(element: Element): string[] {
  return tokens(element).filter(token => {
    const cut = token.lastIndexOf(':');
    if (cut === -1) return true;
    return ALWAYS_ON_PREFIX.test(token.slice(0, cut + 1));
  });
}

function utility(token: string) {
  return token.slice(token.lastIndexOf(':') + 1);
}

const CLIPPING = /^overflow(?:-[xy])?-(?:hidden|clip)$/;

function headerControls() {
  const header = document.querySelector('[data-sidebar="header"]');
  const actions = document.querySelector('[data-sidebar-header-actions]');
  if (!(header instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
    throw new Error('sidebar header actions are not mounted');
  }
  const bell = actions.querySelector('[data-inbox-attention]');
  const search = actions.querySelector('[data-app-search-trigger]');
  const toggle = screen.getByTestId('sidebar-rail-toggle');
  if (!(bell instanceof HTMLElement) || !(search instanceof HTMLElement)) {
    throw new Error('bell or search trigger is missing');
  }
  return { header, actions, controls: { bell, search, toggle } };
}

/** The geometry that decides box, radius, and hit area. */
function geometry(element: Element) {
  const active = activeTokens(element);
  const pick = (pattern: RegExp) =>
    active.filter(token => pattern.test(token)).sort();
  const hasHitTarget44 =
    active.includes('before:h-11') && !active.includes('before:hidden');
  return {
    box: pick(/^(?:size|h|w|min-h|min-w)-/),
    radius: pick(/^rounded(?:-|$)/),
    hitArea: hasHitTarget44 ? '44px pseudo' : 'visible box',
  };
}

describe('sidebar header actions row', () => {
  afterEach(() => {
    document.cookie = 'sidebar:state=; path=/; max-age=0';
  });

  it('gives the bell, search and rail toggle one icon-button contract', () => {
    renderHeader();
    const { controls } = headerControls();
    const shapes = Object.fromEntries(
      Object.entries(controls).map(([name, element]) => [
        name,
        geometry(element),
      ])
    );
    expect(shapes.search).toEqual(shapes.bell);
    expect(shapes.toggle).toEqual(shapes.bell);
    expect(shapes.bell.box).toEqual(['size-7']);
    expect(shapes.bell.radius).toEqual(['rounded-md']);
  });

  it('draws every header glyph at the shared sidebar icon size', () => {
    renderHeader();
    const { controls } = headerControls();
    for (const [name, element] of Object.entries(controls)) {
      // A parent `[&_svg]:` size outranks the glyph's own class, so it must
      // agree with the shared token too (IconButton sm forces 14px).
      const parentGlyphSize = tokens(element).filter(token =>
        /^\[&_svg\]:(?:size|h|w)-/.test(token)
      );
      expect(
        parentGlyphSize.filter(
          token => token !== '[&_svg]:size-(--app-shell-sidebar-icon-size)'
        ),
        name
      ).toEqual([]);
      const glyphs = element.querySelectorAll('svg');
      expect(glyphs.length, name).toBeGreaterThan(0);
      for (const glyph of glyphs) {
        const glyphSize = activeTokens(glyph).filter(token =>
          /^(?:size|h|w)-/.test(token)
        );
        expect(glyphSize, name).toEqual([
          'size-(--app-shell-sidebar-icon-size)',
        ]);
      }
    }
  });

  it('spaces the three controls evenly and centers them on the logo row', () => {
    renderHeader();
    const { actions, controls } = headerControls();
    const brandRow = actions.closest('[data-sidebar-brand-row]');
    expect(brandRow).toHaveClass('items-center');
    expect(actions).toHaveClass('items-center');

    const gap = activeTokens(actions).find(token => /^gap-/.test(token));
    expect(gap, 'header actions need an explicit gap').toBeDefined();
    const toggleSlot = controls.toggle.closest(
      '[data-sidebar-header-toggle-slot]'
    );
    expect(toggleSlot).not.toBeNull();
    const lead = activeTokens(toggleSlot as Element).find(token =>
      /^ml-/.test(token)
    );
    // Search -> toggle must match bell -> search.
    expect(lead?.replace(/^ml-/, '')).toBe(gap?.replace(/^gap-/, ''));

    const logoRow = brandRow?.firstElementChild?.firstElementChild;
    expect(logoRow).toHaveClass('h-7');
  });

  it('never clips a focus ring between a header control and the sidebar header', () => {
    renderHeader();
    const { header, controls } = headerControls();
    for (const [name, element] of Object.entries(controls)) {
      const clippers: string[] = [];
      let node: Element | null = element.parentElement;
      while (node && node !== header.parentElement) {
        const clipping = activeTokens(node).filter(token =>
          CLIPPING.test(utility(token))
        );
        if (clipping.length > 0) {
          clippers.push(
            `${node.tagName.toLowerCase()}${
              node.getAttribute('data-sidebar')
                ? `[data-sidebar=${node.getAttribute('data-sidebar')}]`
                : ''
            } ${clipping.join(' ')}`
          );
        }
        node = node.parentElement;
      }
      expect(clippers, `${name} has a clipping ancestor`).toEqual([]);
    }
  });

  it('keeps the unread dot on the bell', () => {
    renderHeader({
      data: { inboxNavigation: { state: 'available', pendingCount: 3 } },
    });
    const { controls } = headerControls();
    expect(controls.bell).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(controls.bell).toHaveAttribute('data-inbox-attention', 'available');
    expect(controls.bell).toHaveAccessibleName(/^Inbox — /);
    expect(controls.bell.querySelector('span.bg-accent')).not.toBeNull();
  });
});

describe('sidebar header logo', () => {
  afterEach(() => {
    document.cookie = 'sidebar:state=; path=/; max-age=0';
  });

  /**
   * Every "Jovie" text node in the brand row must sit inside a wordmark box
   * the reveal CSS keys on, inside its trigger. A label outside that pair is
   * painted at rest (Tim's 2026-11-14 screenshot: admins get the workspace
   * switcher, whose label was always visible).
   */
  function expectBrandWordOnlyInRevealBox(
    triggerSelector: string,
    wordmarkSelector: string
  ) {
    const row = document.querySelector('[data-sidebar-brand-row]');
    expect(row).not.toBeNull();
    const walker = document.createTreeWalker(
      row as Element,
      NodeFilter.SHOW_TEXT
    );
    const hosts: Element[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.includes('Jovie') && node.parentElement) {
        hosts.push(node.parentElement);
      }
    }
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      const wordmark = host.closest(wordmarkSelector);
      expect(
        wordmark,
        `"${host.textContent}" outside the reveal box`
      ).not.toBeNull();
      expect(wordmark?.closest(triggerSelector)).not.toBeNull();
    }
  }

  it('keeps the customer brand word inside the Ask Jovie reveal box', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'Ask Jovie' });
    expect(trigger).toHaveClass('ask-jovie-mark');
    expect(trigger.querySelector('.ask-jovie-wordmark')).toHaveTextContent(
      'Jovie'
    );
    expectBrandWordOnlyInRevealBox('.ask-jovie-mark', '.ask-jovie-wordmark');
  });

  it('keeps the admin workspace label inside the same reveal box', () => {
    renderHeader({ data: { isAdmin: true } });
    const trigger = screen.getByRole('button', {
      name: 'Switch Workspace: Jovie',
    });
    expect(trigger).toHaveClass('sidebar-wordmark-reveal');
    expect(trigger.querySelector('.sidebar-wordmark')).toHaveTextContent(
      'Jovie'
    );
    expectBrandWordOnlyInRevealBox(
      '.sidebar-wordmark-reveal',
      '.sidebar-wordmark'
    );
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).toMatch(
      /\.sidebar-wordmark-reveal \.sidebar-wordmark[^{]*\{[^}]*grid-template-columns: 0fr;[^}]*opacity: 0;/
    );
  });

  it('shows the mark at rest and reveals the clipped wordmark without moving the actions', () => {
    renderHeader();
    const trigger = screen.getByTestId('ask-jovie-trigger');
    const wordmark = trigger.querySelector('.ask-jovie-wordmark');
    expect(wordmark).not.toBeNull();
    // The reveal animates width inside its own clip box.
    expect(wordmark).toHaveClass('overflow-hidden');
    // The logo slot absorbs the reveal: it is the flex-1 track, so the
    // actions keep their x position while the wordmark grows.
    const logoSlot = trigger.closest('[data-sidebar-brand-row] > div');
    expect(logoSlot).toHaveClass('min-w-0', 'flex-1');
    // Themed ring instead of a raw white/30 one.
    expect(trigger).toHaveClass('focus-ring-themed');
    expect(tokens(trigger).some(token => token.includes('white/'))).toBe(false);

    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
    // Read the rule blocks whose selector lists name the Ask Jovie wordmark.
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, selectors]) => selectors.includes('.ask-jovie-wordmark')
    );
    const rest = blocks.find(
      ([, selectors]) =>
        /\.ask-jovie-mark \.ask-jovie-wordmark\s*,/.test(selectors) &&
        !selectors.includes(':hover')
    )?.[2];
    expect(rest).toContain('opacity: 0');
    expect(rest).toContain('grid-template-columns: 0fr');
    expect(rest).toMatch(/transition:[^;]*opacity/);
    const reveal = blocks.find(
      ([, selectors]) =>
        selectors.includes('.ask-jovie-mark:hover .ask-jovie-wordmark') &&
        selectors.includes(
          '.ask-jovie-mark:focus-visible .ask-jovie-wordmark'
        ) &&
        !selectors.includes('[data-collapsible')
    )?.[2];
    expect(reveal).toContain('opacity: 1');
    expect(reveal).toContain('grid-template-columns: 1fr');
  });

  it('keeps a named logo control in the collapsed rail', () => {
    renderHeader({ open: false });
    const trigger = screen.getByTestId('ask-jovie-trigger');
    // The mark is the Ask Jovie popover trigger (JOV-6569); its name keeps
    // the visible "Jovie" wordmark (WCAG 2.5.3) and says what it does.
    expect(trigger).toHaveAccessibleName('Ask Jovie');
    expect(trigger).not.toHaveAttribute('aria-hidden');
    expect(trigger.closest('[inert]')).toBeNull();
  });
});
