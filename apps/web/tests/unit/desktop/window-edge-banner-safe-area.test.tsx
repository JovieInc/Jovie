import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import postcss, { type Root } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminStepUpBanner } from '@/features/admin/AdminStepUpBanner';

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: { listUserPasskeys: vi.fn(), addPasskey: vi.fn() },
    signIn: { passkey: vi.fn() },
  },
}));

const APP_ROOT = resolve(__dirname, '../../..');
const css: Root = postcss.parse(
  readFileSync(resolve(APP_ROOT, 'app/globals.css'), 'utf8')
);

function declarationsFor(element: Element, property: string): string[] {
  const values: string[] = [];
  css.walkRules(rule => {
    if (!rule.selector.includes('[data-window-edge-banner=')) return;
    if (!element.matches(rule.selector)) return;
    rule.walkDecls(property, declaration => {
      values.push(declaration.value);
    });
  });
  return values;
}

function electronToken(name: string): number {
  let value: number | null = null;
  css.walkRules('html[data-desktop-runtime="electron"]', rule => {
    rule.walkDecls(name, declaration => {
      value = Number.parseFloat(declaration.value);
    });
  });
  if (value === null) throw new Error(`missing ${name}`);
  return value;
}

function setRuntime(runtime?: 'electron', platform?: string) {
  const root = document.documentElement;
  if (runtime) root.dataset.desktopRuntime = runtime;
  else root.removeAttribute('data-desktop-runtime');
  if (platform) root.dataset.electronPlatform = platform;
  else root.removeAttribute('data-electron-platform');
}

afterEach(() => setRuntime());

describe('window-edge banners respect the macOS traffic-light safe area', () => {
  it('insets the admin step-up banner past the traffic lights in the Mac app', () => {
    setRuntime('electron', 'darwin');
    render(<AdminStepUpBanner />);
    const banner = screen.getByRole('status');

    expect(declarationsFor(banner, 'padding-left').at(-1)).toBe(
      'calc(var(--electron-traffic-light-safe-width) + 12px)'
    );
    expect(declarationsFor(banner, 'min-height').at(-1)).toBe(
      'var(--electron-titlebar-height)'
    );
    expect(declarationsFor(banner, '-webkit-app-region').at(-1)).toBe('drag');
  });

  it('keeps the safe width wider than the three native window buttons', () => {
    // hiddenInset draws three 14px buttons with 6px gaps from traffic-light-x.
    const lightsRightEdge = electronToken('--electron-traffic-light-x') + 54;
    expect(
      electronToken('--electron-traffic-light-safe-width')
    ).toBeGreaterThan(lightsRightEdge - 4);
  });

  it.each([
    ['the browser', undefined, undefined],
    ['Windows Electron', 'electron', 'win32'],
  ] as const)(
    'leaves the banner untouched in %s',
    (_label, runtime, platform) => {
      setRuntime(runtime, platform);
      render(<AdminStepUpBanner />);
      expect(
        declarationsFor(screen.getByRole('status'), 'padding-left')
      ).toEqual([]);
    }
  );

  it('gives in-flow banners their height from the shell, not past the window', () => {
    const source = readFileSync(
      resolve(APP_ROOT, 'app/app/(shell)/DashboardShellContent.tsx'),
      'utf8'
    );
    expect(source).toContain("<div className='flex h-full flex-col'>");
    expect(source).toContain(
      "<div data-dashboard-shell-slot='true' className='min-h-0 flex-1'>"
    );
    let slotRule = '';
    css.walkRules(rule => {
      if (rule.selector.includes('[data-dashboard-shell-slot="true"]')) {
        rule.walkDecls('height', declaration => {
          slotRule = `${rule.selector} { height: ${declaration.value} }`;
        });
      }
    });
    expect(slotRule).toBe(
      '[data-dashboard-shell-slot="true"] [data-sidebar-wrapper="true"] { height: 100% }'
    );
  });

  it.each([
    'components/features/admin/AdminStepUpBanner.tsx',
    'components/features/admin/OperatorBanner.tsx',
    'components/features/admin/ImpersonationBanner.tsx',
  ])('%s opts into the window-edge contract', file => {
    expect(readFileSync(resolve(APP_ROOT, file), 'utf8')).toContain(
      "data-window-edge-banner='true'"
    );
  });
});
