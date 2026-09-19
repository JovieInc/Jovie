import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { THEME_ROUTE_POLICY } from '@/lib/theme/route-policy';

const SCRIPT = readFileSync(
  resolve(process.cwd(), 'public/theme-init.js'),
  'utf8'
);

function runThemeInit({
  pathname,
  storageValue,
  systemPrefersDark,
  initiallyDark = false,
}: Readonly<{
  pathname: string;
  storageValue: string | null;
  systemPrefersDark: boolean;
  initiallyDark?: boolean;
}>) {
  const classNames = new Set(initiallyDark ? ['dark'] : []);
  const root = {
    classList: {
      add: (name: string) => classNames.add(name),
      contains: (name: string) => classNames.has(name),
      remove: (name: string) => classNames.delete(name),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classNames.has(name);
        if (next) classNames.add(name);
        else classNames.delete(name);
        return next;
      },
    },
    dataset: {} as Record<string, string>,
  };
  const meta = { setAttribute: vi.fn() };

  runInNewContext(SCRIPT, {
    URLSearchParams,
    document: {
      documentElement: root,
      getElementById: (id: string) =>
        id === 'jovie-theme-route-policy'
          ? { textContent: JSON.stringify(THEME_ROUTE_POLICY) }
          : null,
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]' ? meta : null,
    },
    globalThis: {
      location: { pathname, search: '' },
      matchMedia: () => ({ matches: systemPrefersDark }),
    },
    localStorage: {
      getItem: () => storageValue,
    },
  });

  return { classNames, meta };
}

describe('theme-init prepaint policy', () => {
  it('applies a stored light preference on declared marketing routes', () => {
    const { classNames, meta } = runThemeInit({
      pathname: '/about',
      storageValue: 'light',
      systemPrefersDark: true,
      initiallyDark: true,
    });

    expect(classNames.has('dark')).toBe(false);
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#ffffff');
  });

  it('resolves system preference on a declared route family', () => {
    const { classNames, meta } = runThemeInit({
      pathname: '/blog/entry',
      storageValue: 'system',
      systemPrefersDark: true,
    });

    expect(classNames.has('dark')).toBe(true);
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#0a0a0a');
  });

  it('fails closed to dark on excluded public profile lookalikes', () => {
    const { classNames, meta } = runThemeInit({
      pathname: '/artistname',
      storageValue: 'light',
      systemPrefersDark: false,
    });

    expect(classNames.has('dark')).toBe(true);
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#0a0a0a');
  });
});
