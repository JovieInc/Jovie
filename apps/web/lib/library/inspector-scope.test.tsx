import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_PRESENCE_LEAK_RECOMMENDATIONS,
  INSPECTOR_SCOPE_ARTIST_LEAK_TEST_ID,
  InspectorScopeArtistLeakFixture,
} from '@/lib/library/fixtures/inspector-scope-artist-leak';
import {
  canRenderScopedItemInLibraryInspector,
  deriveInspectorScope,
  libraryInspectorSelectionForAsset,
  mapSubjectTypeToScopeType,
  PRESENCE_ISSUE_TYPES,
  selectFindingsForLibraryAsset,
  selectFindingsForLibraryInspector,
} from '@/lib/library/inspector-scope';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

const LIBRARY_RAIL_RECOMMENDATION_INJECTION_PATHS = [
  {
    path: 'app/app/(shell)/library/PostReleasePanel.tsx',
    scopeType: 'mixed-until-filtered',
    leak: "subjectType === 'artist'",
    role: 'Renderer. Must filter through canRenderScopedItemInLibraryInspector.',
  },
  {
    path: 'app/app/(shell)/library/LibrarySurface.tsx',
    scopeType: 'release-or-track',
    leak: null,
    role: 'Mounts PostReleasePanel for release items and linkedReleaseId tracks.',
  },
  {
    path: 'lib/library/post-release-store.ts',
    scopeType: 'profile-bundle',
    leak: null,
    role: 'Loads all profile findings. Classification happens on the view + renderer.',
  },
] as const;

const trackInspector = {
  kind: 'track' as const,
  scopeIds: new Set(['track-1', 'release-1']),
};

const releaseInspector = {
  kind: 'release' as const,
  scopeIds: new Set(['release-1']),
};

describe('inspector scope integrity', () => {
  it('classifies persisted subject types onto explicit scope_type values', () => {
    expect(mapSubjectTypeToScopeType('artist')).toBe('artist');
    expect(mapSubjectTypeToScopeType('release')).toBe('release');
    expect(mapSubjectTypeToScopeType('recording')).toBe('track');
    expect(mapSubjectTypeToScopeType('track')).toBe('track');
    expect(PRESENCE_ISSUE_TYPES).toContain('missing_jovie_link');
    expect(
      deriveInspectorScope({
        subjectType: 'artist',
        subjectId: 'profile-1',
        issueType: 'missing_jovie_link',
        kind: 'repair',
      })
    ).toEqual({
      scopeType: 'artist',
      scopeId: 'profile-1',
      category: 'presence',
      primitive: 'recommendation',
      blocksSelectedObject: false,
    });
  });

  it('rejects artist Presence recommendations inside track and release inspectors', () => {
    for (const leak of ARTIST_PRESENCE_LEAK_RECOMMENDATIONS) {
      expect(canRenderScopedItemInLibraryInspector(leak, trackInspector)).toBe(
        false
      );
      expect(
        canRenderScopedItemInLibraryInspector(leak, releaseInspector)
      ).toBe(false);
    }

    const selectedTrackRepair = {
      scopeType: 'track' as const,
      scopeId: 'track-1',
      category: 'presence' as const,
      primitive: 'recommendation' as const,
      status: 'open' as const,
    };
    expect(
      canRenderScopedItemInLibraryInspector(selectedTrackRepair, trackInspector)
    ).toBe(true);
    expect(
      canRenderScopedItemInLibraryInspector(
        selectedTrackRepair,
        releaseInspector
      )
    ).toBe(false);
  });

  it('allows only a contextual blocker that directly blocks the selected object', () => {
    const blocker = {
      scopeType: 'artist' as const,
      scopeId: 'profile-1',
      category: 'connection' as const,
      primitive: 'blocker' as const,
      blocksSelectedObject: true,
      status: 'open' as const,
    };
    const artistDump = {
      ...blocker,
      category: 'presence' as const,
      primitive: 'recommendation' as const,
      blocksSelectedObject: false,
    };

    expect(canRenderScopedItemInLibraryInspector(blocker, trackInspector)).toBe(
      true
    );
    expect(
      canRenderScopedItemInLibraryInspector(blocker, releaseInspector)
    ).toBe(true);
    expect(
      canRenderScopedItemInLibraryInspector(artistDump, trackInspector)
    ).toBe(false);
  });

  it('keeps the deliberate-red artist dump fixture out of the production filter', () => {
    render(<InspectorScopeArtistLeakFixture />);
    const fixture = screen.getByTestId(INSPECTOR_SCOPE_ARTIST_LEAK_TEST_ID);
    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture).toHaveAttribute('data-inspector-kind', 'track');
    expect(fixture).toHaveTextContent('Last.fm');
    expect(fixture).toHaveTextContent('Genius');
    expect(fixture).toHaveTextContent('MusicBrainz');

    expect(
      selectFindingsForLibraryInspector(
        ARTIST_PRESENCE_LEAK_RECOMMENDATIONS,
        trackInspector
      )
    ).toEqual([]);
    expect(
      selectFindingsForLibraryAsset(ARTIST_PRESENCE_LEAK_RECOMMENDATIONS, {
        id: 'track-1',
        itemKind: 'audio',
        linkedReleaseId: 'release-1',
      })
    ).toEqual([]);
  });

  it('inventories Library rail injection paths and forbids the artist-dump leak', () => {
    for (const entry of LIBRARY_RAIL_RECOMMENDATION_INJECTION_PATHS) {
      const source = readSource(entry.path);
      expect(source.length).toBeGreaterThan(0);
      expect(entry.role.length).toBeGreaterThan(0);
      expect(entry.scopeType.length).toBeGreaterThan(0);
      if (entry.leak) {
        expect(source, entry.path).not.toContain(entry.leak);
      }
    }

    const panel = readSource('app/app/(shell)/library/PostReleasePanel.tsx');
    expect(panel).toContain('selectFindingsForLibraryAsset');
    expect(panel).not.toContain("subjectType === 'artist'");

    const surface = readSource('app/app/(shell)/library/LibrarySurface.tsx');
    expect(surface).toContain('<PostReleasePanel');

    expect(
      libraryInspectorSelectionForAsset({
        id: 'release-1',
        source: { canonicalId: 'release-1' },
      }).kind
    ).toBe('release');
    expect(
      libraryInspectorSelectionForAsset({
        id: 'track-1',
        itemKind: 'audio',
        linkedReleaseId: 'release-1',
      }).kind
    ).toBe('track');
  });
});
