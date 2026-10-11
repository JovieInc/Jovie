import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_IPHONE_BEZEL } from '@/components/marketing/device/deviceBezels';

/**
 * Device policy (founder decision 2026-09-29):
 * - iPhones always use the official latest iPhone Pro bezel from Apple
 *   Design Resources — never CSS-simulated hardware.
 * - The bezel frames native iOS app screens only (license scope); mobile
 *   web renders bezel-free via MobileWebScreen.
 * - Apple guidelines: the bezel is shown as-is (no shadow, tilt, crop).
 */

const WEB_ROOT = process.cwd();
const DEVICE_MODULE = 'components/marketing/device/';
const SCAN_ROOTS = ['app', 'components', 'styles'] as const;
const NON_PRODUCT = /\.(test|spec|stories)\.[jt]sx?$/;
const NON_SOURCE_DIRECTORIES = new Set([
  'node_modules',
  '__generated__',
  '.next',
  '.cache',
  'coverage',
  'dist',
]);

const SIMULATED_HARDWARE =
  /dynamic[-_ ]?island|phone[-_]notch|__notch\b|phone[-_]status[-_]bar|home[-_]indicator|>\s*9:41\s*</i;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (NON_SOURCE_DIRECTORIES.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !NON_PRODUCT.test(name)) {
      out.push(relative(WEB_ROOT, full));
    }
  }
  return out;
}

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const productFiles = SCAN_ROOTS.flatMap(root =>
  walk(resolve(WEB_ROOT, root), [])
);

function pngSize(path: string) {
  const header = readFileSync(resolve(WEB_ROOT, path));
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

describe('device frame policy', () => {
  it('scans a non-trivial source set (fail closed)', () => {
    expect(productFiles.length).toBeGreaterThan(500);
  });

  it('draws no simulated iPhone hardware outside the device module', () => {
    const offenders = productFiles
      .filter(file => !file.startsWith(DEVICE_MODULE))
      .filter(file =>
        SIMULATED_HARDWARE.test(
          stripComments(readFileSync(resolve(WEB_ROOT, file), 'utf8'))
        )
      );
    expect(offenders).toEqual([]);
  });

  it('references the official bezel asset only through deviceBezels.ts', () => {
    const offenders = productFiles
      .filter(file => file !== `${DEVICE_MODULE}deviceBezels.ts`)
      .filter(file =>
        readFileSync(resolve(WEB_ROOT, file), 'utf8').includes(
          '/device-bezels/'
        )
      );
    expect(offenders).toEqual([]);
  });

  it('ships the unmodified official bezel with the declared geometry', () => {
    const size = pngSize(`public${OFFICIAL_IPHONE_BEZEL.src}`);
    expect(size).toEqual({
      width: OFFICIAL_IPHONE_BEZEL.width,
      height: OFFICIAL_IPHONE_BEZEL.height,
    });
    // iPhone Pro logical screen at @3x.
    expect(OFFICIAL_IPHONE_BEZEL.screen.width / 3).toBe(402);
    expect(OFFICIAL_IPHONE_BEZEL.screen.height / 3).toBe(874);
  });

  it('keeps the CSS screen opening in sync with the bezel geometry', () => {
    const css = readFileSync(
      resolve(WEB_ROOT, `${DEVICE_MODULE}DeviceScreen.css`),
      'utf8'
    );
    const { width, height, screen } = OFFICIAL_IPHONE_BEZEL;
    const pct = (value: number, of: number) =>
      `${Number(((value / of) * 100).toFixed(4))}%`;
    const opening = css.match(
      /\.official-iphone-frame__screen \{([^}]*)\}/
    )?.[1];
    expect(opening).toContain(`left: ${pct(screen.x, width)}`);
    expect(opening).toContain(`top: ${pct(screen.y, height)}`);
    expect(opening).toContain(`width: ${pct(screen.width, width)}`);
    expect(opening).toContain(`height: ${pct(screen.height, height)}`);
    expect(css).toContain(`aspect-ratio: ${width} / ${height}`);
  });

  it('never decorates the official bezel (Apple marketing guidelines)', () => {
    const css = stripComments(
      readFileSync(
        resolve(WEB_ROOT, `${DEVICE_MODULE}DeviceScreen.css`),
        'utf8'
      )
    );
    expect(css).not.toMatch(
      /box-shadow|filter|transform|rotate|perspective|gradient|animation/
    );
    const component = readFileSync(
      resolve(WEB_ROOT, `${DEVICE_MODULE}DeviceScreen.tsx`),
      'utf8'
    );
    expect(component).toContain("readonly platform: 'ios-native'");
  });
});
