import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_MARKETING_HEADER_CTA } from '@/data/marketing/headerCta';

const pathnameRef = vi.hoisted(() => ({ current: null as string | null }));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, usePathname: () => pathnameRef.current };
});
vi.mock('@/components/providers/ClientProviders', () => ({
  ClientProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/marketing/WebMcpTools', () => ({
  WebMcpTools: () => null,
}));
vi.mock('@/lib/content-records/site-chrome.server', () => ({
  getSiteChrome: async () => undefined,
}));
vi.mock('./home.css', () => ({}));
vi.mock('next/font/local', () => ({
  default: () => ({ className: 'geist-mono', variable: 'geist-mono-var' }),
}));
vi.mock('../../components/marketing/MarketingSnapRail.css', () => ({}));

import HomeLayout from './layout';

/**
 * Regression guard: the statically prerendered homepage resolves usePathname()
 * to a value other than "/" on the server, so any pathname-derived chrome
 * (page-contract markers, header CTA) rendered differently from the browser
 * and React threw hydration error #418 on every visit to https://jov.ie/.
 */
describe('(home) layout hydration', () => {
  async function renderHtml(pathname: string | null) {
    pathnameRef.current = pathname;
    const ui = await HomeLayout({ children: <p>hero</p> });
    const { container, unmount } = render(ui);
    const html = container.innerHTML;
    unmount();
    return html;
  }

  it('renders identical markup whatever usePathname() returns', async () => {
    const server = await renderHtml(null);
    expect(await renderHtml('/index')).toBe(server);
    expect(await renderHtml('/__prerender__')).toBe(server);
    expect(await renderHtml('/')).toBe(server);
  });

  it('scopes Geist Mono to the homepage shell', async () => {
    expect(await renderHtml(null)).toContain('geist-mono-var home-viewport');
  });

  it('always renders the homepage page-contract marker and the claim CTA', async () => {
    const html = await renderHtml(null);
    expect(html).toContain('data-primary-cta="true"');
    expect(html).toContain(`href="${HOME_MARKETING_HEADER_CTA.href}"`);
    expect(html).not.toContain('href="/#request-invite"');
  });

  describe('homepage claim intent', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    async function renderFreshLayout() {
      vi.resetModules();
      pathnameRef.current = null;
      const { default: FreshLayout } = await import('./layout');
      const { container, unmount } = render(
        await FreshLayout({ children: <p>hero</p> })
      );
      const html = container.innerHTML;
      unmount();
      return html;
    }

    it('points the header action and the page-contract marker at the claim intent', async () => {
      const html = await renderFreshLayout();
      const { getClaimProfileIntent } = await import(
        '@/data/marketingCtaIntents'
      );
      const claim = getClaimProfileIntent();
      expect(html).toContain('data-primary-cta="true"');
      expect(html).toContain(`href="${claim.href}"`);
      expect(html).toContain(claim.label);
      expect(html).not.toContain('#request-invite');
      expect(html).not.toMatch(/request an invite/i);
    });

    it('keeps the shared claim entry while /start owns the closed-signup gate', async () => {
      vi.stubEnv('FEATURE_PUBLIC_SIGNUP_CLOSED', 'true');
      const html = await renderFreshLayout();
      expect(html).toContain(`href="${HOME_MARKETING_HEADER_CTA.href}"`);
      expect(html).not.toContain('href="/#request-invite"');
    });
  });
});
