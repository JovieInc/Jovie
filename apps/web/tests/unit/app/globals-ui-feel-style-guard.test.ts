import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsPath = 'app/globals.css';

function readGlobals() {
  return readFileSync(resolve(process.cwd(), globalsPath), 'utf8');
}

describe('globals.css ui-feel quick wins (JOV-3368)', () => {
  const source = readGlobals();

  it('applies root font antialiasing', () => {
    expect(source).toContain('-webkit-font-smoothing: antialiased');
    expect(source).toContain('-moz-osx-font-smoothing: grayscale');
  });

  it('applies text-wrap balance on headings and pretty on body', () => {
    expect(source).toMatch(/h1,\s*\n\s*h2[\s\S]*text-wrap:\s*balance/);
    expect(source).toMatch(/body\s*\{[\s\S]*text-wrap:\s*pretty/);
  });

  it('applies tabular-nums on dynamic numerals', () => {
    expect(source).toMatch(
      /:where\(\.tabular-nums,\s*time,\s*\[data-tabular-nums\],\s*kbd\)[\s\S]*font-variant-numeric:\s*tabular-nums/
    );
  });

  it('applies subtle 1px image outlines', () => {
    expect(source).toMatch(
      /:where\(img:not\(\[role="presentation"\]\)[\s\S]*outline:\s*1px solid/
    );
  });

  it('keeps press compression explicit and token-driven', () => {
    expect(source).toContain('.interactive-press');
    expect(source).toMatch(
      /\.interactive-press\s*\{[\s\S]*transition-transform[\s\S]*active:scale-press/
    );
    expect(source).not.toContain(
      'button:not(:disabled):not([data-static="true"])'
    );
    expect(source).not.toMatch(/transform:\s*scale\(0\.96\)/);
    expect(source).not.toMatch(
      /\.interactive-press\s*\{[^}]*transition:\s*all/
    );
  });

  it('migrates btn-press from opacity to scale press feedback', () => {
    expect(source).toMatch(
      /\.btn-press\s*\{[\s\S]*transition-transform[\s\S]*active:scale-press/
    );
    expect(source).not.toMatch(/\.btn-press\s*\{[^}]*active:opacity-80/);
  });
});

describe('public root stylesheet isolation', () => {
  const source = readGlobals();
  const chatLayout = readFileSync(
    resolve(process.cwd(), 'app/app/(shell)/chat/layout.tsx'),
    'utf8'
  );

  it('keeps chat-only CSS out of public routes', () => {
    expect(source).not.toContain('streamdown/styles.css');
    expect(source).not.toContain('chat-file-upload.css');
    expect(source).not.toContain('node_modules/streamdown');
    expect(chatLayout).toContain("import 'streamdown/styles.css'");
    expect(chatLayout).toContain("styles/chat-file-upload.css'");
  });

  it.each([
    'app/(home)/layout.tsx',
    'app/(marketing)/layout.tsx',
    'app/(dynamic)/playlists/layout.tsx',
    'app/brand/layout.tsx',
    'app/exp/layout.tsx',
  ])('loads the shared public theme bridge for %s', routeSource => {
    const source = readFileSync(resolve(process.cwd(), routeSource), 'utf8');

    expect(source).toContain('components/marketing/MarketingSnapRail.css');
  });

  it('keeps the root 404 on its isolated public bridge bundle', () => {
    const notFoundSource = readFileSync(
      resolve(process.cwd(), 'app/not-found.tsx'),
      'utf8'
    );

    expect(notFoundSource).toContain(
      'components/marketing/MarketingSnapRail.css'
    );
    expect(notFoundSource).toContain(
      'components/marketing/artist-profile/ShellCtaButton.css'
    );
    expect(notFoundSource).not.toContain('ArtistProfileLandingPage.css');
  });
});

describe('electron compact-window desktop shell (JOV-8942)', () => {
  const source = readGlobals();

  it('hides the mobile bottom surface in the desktop runtime at every width', () => {
    expect(source).toMatch(
      /html\[data-desktop-runtime="electron"\][\s\S]{0,200}?\[data-testid="app-shell-mobile-bottom-surface"\][\s\S]{0,40}?\{[\s\S]{0,80}?display:\s*none;/
    );
  });

  it('keeps the desktop frame chrome in the compact range', () => {
    const compact = source.match(
      /@media \(max-width: 1023px\)[\s\S]{0,2000}?html\[data-desktop-runtime="electron"\][\s\S]{0,200}?#main-content[\s\S]{0,400}?\}/
    );
    expect(compact).not.toBeNull();
    const block = compact?.[0] ?? '';
    expect(block).toContain('gap: var(--app-shell-gap)');
    expect(block).toContain('padding: var(--app-shell-gap)');
    expect(block).toContain('display: flex');
    expect(block).toContain('border-radius: var(--app-shell-radius)');
    expect(block).toContain('box-shadow: var(--app-shell-sidebar-shadow)');
    expect(block).toContain('box-shadow: var(--app-shell-shadow)');
  });
});
