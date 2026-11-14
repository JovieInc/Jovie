import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('UserButton browser chunk diet (JOV-12023)', () => {
  // #24725 named these the last eager desktop edges; UserButton must never
  // reintroduce them. A static titlebar import drags electron-bridge, the
  // update modal and radix dialog into every browser shell chunk.
  const source = readFileSync(path.join(__dirname, 'UserButton.tsx'), 'utf8');
  const lazySource = readFileSync(
    path.join(__dirname, 'desktop-release-identity.lazy.ts'),
    'utf8'
  );

  it('keeps every desktop module out of the static import graph', () => {
    expect(source).not.toMatch(
      /from '@\/components\/organisms\/DesktopTitlebar'/
    );
    expect(source).not.toMatch(/from '@\/lib\/desktop\/electron-bridge'/);
    expect(source).not.toMatch(
      /from '@\/lib\/workspace-lock\/unlock-with-passkey'/
    );
    expect(source).toMatch(/from '@\/lib\/desktop\/electron-runtime'/);
    expect(source).toMatch(/from '\.\/desktop-release-identity\.lazy'/);
    expect(lazySource).toMatch(
      /import\('@\/components\/organisms\/DesktopTitlebar'/
    );
    expect(lazySource).toMatch(/ssr: false/);
  });
});
