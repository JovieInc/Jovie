import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

const rawComponentVisualPatterns = [
  /\b(?:bg|border|text|ring|shadow|outline|rounded|h|w|max-w|min-h|min-w|tracking|leading|px|py|pt|pb)-\[[^\]]+\]/,
  /\b(?:bg|border|ring|text)-\(--[^)]+\)/,
  /color-mix\(/i,
  /--linear-/,
  /\brgba?\(/i,
  /#[0-9A-Fa-f]{3,8}\b/,
  /duration-150/,
  /\bshadow-\[/,
  /text-white\/60/,
];

function readWebFile(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

describe('SpotifyConnectDialog System B style guard', () => {
  it('keeps dialog source on named System B primitives', () => {
    const source = readWebFile(
      'components/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog.tsx'
    );
    const offenders = rawComponentVisualPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(
      offenders,
      `SpotifyConnectDialog leaked ${offenders.join(', ')}`
    ).toEqual([]);
  });

  it('uses the canonical @jovie/ui atoms instead of raw form controls', () => {
    const source = readWebFile(
      'components/features/dashboard/organisms/release-provider-matrix/SpotifyConnectDialog.tsx'
    );

    // Canonical atoms own the input, buttons, and keycaps.
    expect(source).toContain("from '@jovie/ui'");
    expect(source).toContain('<Input');
    expect(source).toContain('<Button');
    expect(source).toContain('<Kbd');

    // No raw input/select; result rows follow the repo-canonical
    // picker-rows combobox option pattern (native button + role='option'),
    // with keyboard activation flowing through the combobox input.
    expect(source).not.toMatch(/<input[\s>]/);
    expect(source).not.toMatch(/<select[\s>]/);
    expect(source).toContain("role='option'");
    expect(source).toContain("role='listbox'");

    // One flat surface: the dialog owns the chrome, so the body renders no
    // nested card, bordered panel, or boxed result list.
    expect(source).not.toContain('DrawerSurfaceCard');
    expect(source).not.toContain('system-b-spotify-connect');
  });
});
