import { describe, expect, it } from 'vitest';
import {
  type LibraryPostReleaseBundle,
  withInspectorScope,
} from './post-release-types';
import {
  deriveWorkInspectorPresentation,
  scopeWorkInspectorBundle,
} from './work-inspector-read-model';

const bundle = {
  downloads: [
    { id: 'download-a', releaseId: 'release-a', title: 'A', fileName: 'a.wav' },
    { id: 'download-b', releaseId: 'release-b', title: 'B', fileName: 'b.wav' },
  ],
  findings: [
    withInspectorScope({
      id: 'finding-a',
      subjectType: 'release',
      subjectId: 'release-a',
      kind: 'repair',
      issueType: 'dead_link',
      platform: 'Spotify',
      title: 'Repair A',
      currentUrl: null,
      expectedUrl: null,
      actionMode: 'direct_update',
      status: 'open',
      collisionDisposition: null,
      draftRequest: null,
    }),
    withInspectorScope({
      id: 'finding-b',
      subjectType: 'release',
      subjectId: 'release-b',
      kind: 'repair',
      issueType: 'dead_link',
      platform: 'Apple Music',
      title: 'Repair B',
      currentUrl: null,
      expectedUrl: null,
      actionMode: 'direct_update',
      status: 'open',
      collisionDisposition: null,
      draftRequest: null,
    }),
  ],
  rightsholders: [
    {
      id: 'rights-a',
      subjectType: 'release',
      subjectId: 'release-a',
      partyName: 'Writer A',
      role: 'writer',
      domain: 'composition',
      evidenceClass: 'observed',
      source: 'songview',
      shareBps: null,
    },
    {
      id: 'rights-b',
      subjectType: 'release',
      subjectId: 'release-b',
      partyName: 'Writer B',
      role: 'writer',
      domain: 'composition',
      evidenceClass: 'observed',
      source: 'mlc',
      shareBps: null,
    },
  ],
  stats: [{ platform: 'youtube', connected: true, measurements: [] }],
} satisfies LibraryPostReleaseBundle;

describe('Work inspector read model', () => {
  it('keeps every post-release slice bound to the selected object', () => {
    const releaseA = scopeWorkInspectorBundle({ id: 'release-a' }, bundle);
    const releaseB = scopeWorkInspectorBundle({ id: 'release-b' }, bundle);

    expect(releaseA.downloads.map(item => item.id)).toEqual(['download-a']);
    expect(releaseA.findings.map(item => item.id)).toEqual(['finding-a']);
    expect(releaseA.rightsholders.map(item => item.id)).toEqual(['rights-a']);
    expect(releaseA.stats).toEqual([]);

    expect(releaseB.downloads.map(item => item.id)).toEqual(['download-b']);
    expect(releaseB.findings.map(item => item.id)).toEqual(['finding-b']);
    expect(releaseB.rightsholders.map(item => item.id)).toEqual(['rights-b']);
  });

  it('keeps public page, profile, lifecycle, action, and connections separate', () => {
    expect(
      deriveWorkInspectorPresentation({
        id: 'release-a',
        status: 'released',
        profileVisibility: 'hidden',
        share: { visibility: 'private' },
        providers: [],
      })
    ).toEqual({
      objectId: 'release-a',
      releaseLifecycle: 'released',
      pagePublication: 'not_public',
      profileVisibility: 'hidden',
      primaryVisitorAction: 'Listen',
      destinationState: 'disconnected',
      destinations: [],
    });

    expect(
      deriveWorkInspectorPresentation({
        id: 'document-a',
        itemKind: 'document',
        status: 'draft',
        profileVisibility: 'visible',
        share: null,
        providers: [],
      })
    ).toMatchObject({
      pagePublication: 'unknown',
      profileVisibility: 'visible',
      destinationState: 'unsupported',
      primaryVisitorAction: 'Read',
    });
  });
});
