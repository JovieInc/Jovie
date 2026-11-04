import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

  it('always renders the homepage page-contract marker and /start CTA', async () => {
    const html = await renderHtml(null);
    expect(html).toContain('data-primary-cta="true"');
    expect(html).toContain('href="/start"');
  });
});
