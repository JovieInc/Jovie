import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRAND_MARK_CREAM,
  BRAND_MARK_SIZE,
  PALETTE,
  resolveBrandMarkSize,
} from '@/lib/brand/tokens';

const webRoot = join(process.cwd());

const SPLASH_B_SOURCES = [
  'components/features/auth/AuthLayout.tsx',
  'app/desktop-auth/DesktopAuthClient.tsx',
  'app/(auth)/DesktopAuthRouteHandoff.tsx',
] as const;

const BRAND_LOGO_PRODUCTION_SOURCES = [
  ...SPLASH_B_SOURCES,
  'components/atoms/BrandLogo.tsx',
  'components/atoms/Logo.tsx',
  'components/atoms/LogoIcon.tsx',
  'components/atoms/LogoLoader.tsx',
  'components/features/auth/AuthUnavailableCard.tsx',
  'components/features/onboarding/OnboardingChatEmptyIntro.tsx',
  'components/organisms/UnifiedSidebar.tsx',
  'components/molecules/WorkspaceSelector.tsx',
  'components/molecules/FooterBranding.tsx',
  'components/molecules/ProfileNavButton.tsx',
  'components/shell/AssigneeChip.tsx',
  'components/site/MarketingFooter.tsx',
  'components/features/dashboard/organisms/InlineChatArea.tsx',
  'components/features/dev/DevToolbar.tsx',
  'components/features/demo/DemoShell.tsx',
  'components/features/waitlist/WaitlistIntakeChat.tsx',
  'components/features/home/HomeV1Design.tsx',
  'components/features/home/HeroProfilePreview.tsx',
  'app/app/(shell)/profiles/ProfilesWorkspace.tsx',
  'app/[username]/notifications/NotificationsPageClient.tsx',
] as const;

const ALLOWED_SIZE_TOKENS = new Set<string>(Object.keys(BRAND_MARK_SIZE));
const ALLOWED_SIZE_PX = new Set<number>(Object.values(BRAND_MARK_SIZE));
const RAW_SIZE_RE = /<BrandLogo\b[^>]*\bsize=\{(\d+)\}/g;
const TOKEN_SIZE_RE = /<BrandLogo\b[^>]*\bsize=['"](\w+)['"]/g;
const CONST_SIZE_RE = /<BrandLogo\b[^>]*\bsize=\{BRAND_MARK_SIZE\.(\w+)\}/g;

function readWebSource(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

describe('brand mark size ladder', () => {
  it('locks splash-B to 32px cream', () => {
    expect(BRAND_MARK_SIZE).toEqual({
      compact: 16,
      chrome: 20,
      control: 24,
      splash: 32,
    });
    expect(BRAND_MARK_CREAM).toBe('#F5F4F0');
    expect(PALETTE.surface.find(swatch => swatch.name === 'Cream')?.hex).toBe(
      BRAND_MARK_CREAM
    );
    expect(resolveBrandMarkSize('splash')).toBe(32);
    expect(resolveBrandMarkSize('chrome')).toBe(20);
  });

  it('keeps splash-B BrandLogo call sites on the 32px token', () => {
    for (const relativePath of SPLASH_B_SOURCES) {
      const source = readWebSource(relativePath);
      expect(source).toContain('BRAND_MARK_SIZE.splash');
      expect(source).not.toMatch(
        /<BrandLogo\b[^>]*\bsize=\{(?:[3-9]\d|\d{3,})\}/
      );
      expect(source).not.toContain('size={60}');
      expect(source).not.toContain('size={56}');
      expect(source).not.toContain('size={48}');
      expect(source).not.toContain('size={34}');
    }
  });

  it('rejects ad-hoc BrandLogo pixel sizes off the token ladder', () => {
    const offenders: string[] = [];

    for (const relativePath of BRAND_LOGO_PRODUCTION_SOURCES) {
      const source = readWebSource(relativePath);
      for (const match of source.matchAll(RAW_SIZE_RE)) {
        const px = Number(match[1]);
        if (!ALLOWED_SIZE_PX.has(px)) {
          offenders.push(`${relativePath}: size={${px}}`);
        }
      }
      for (const match of source.matchAll(TOKEN_SIZE_RE)) {
        const token = match[1];
        if (!ALLOWED_SIZE_TOKENS.has(token)) {
          offenders.push(`${relativePath}: size='${token}'`);
        }
      }
      for (const match of source.matchAll(CONST_SIZE_RE)) {
        const token = match[1];
        if (!ALLOWED_SIZE_TOKENS.has(token)) {
          offenders.push(`${relativePath}: BRAND_MARK_SIZE.${token}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
