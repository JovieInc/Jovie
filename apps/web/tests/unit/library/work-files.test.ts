import { describe, expect, it } from 'vitest';
import {
  deriveWorkFiles,
  fileNameFromMediaUrl,
} from '@/lib/library/work-files';

describe('fileNameFromMediaUrl', () => {
  it('returns the decoded last path segment', () => {
    expect(
      fileNameFromMediaUrl('https://cdn.example.com/audio/take%20me%20over.mp3')
    ).toBe('take me over.mp3');
  });

  it('returns null for missing or unusable urls', () => {
    expect(fileNameFromMediaUrl(null)).toBeNull();
    expect(fileNameFromMediaUrl('')).toBeNull();
    expect(fileNameFromMediaUrl('https://cdn.example.com/')).toBeNull();
  });
});

describe('deriveWorkFiles', () => {
  const base = {
    id: 'release-1',
    title: 'Take Me Over',
    previewUrl: 'https://cdn.example.com/audio/master.mp3',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
    videoUrl: null,
    hasVideoLinks: false,
    itemKind: 'release',
    source: null,
  };

  it('lists only real attached files with role and access labels', () => {
    const files = deriveWorkFiles(base, [
      {
        id: 'download-1',
        releaseId: 'release-1',
        title: 'Stem pack',
        fileName: 'stems.zip',
      },
    ]);

    expect(files.map(file => [file.kind, file.name, file.accessLabel])).toEqual(
      [
        ['audio', 'master.mp3', 'Private recording'],
        ['artwork', 'artwork.jpg', 'Published artwork'],
        ['download', 'stems.zip', 'Restricted'],
      ]
    );
  });

  it('emits no empty media-type buckets', () => {
    const files = deriveWorkFiles(
      {
        ...base,
        previewUrl: null,
        artworkUrl: null,
      },
      []
    );
    expect(files).toEqual([]);
  });

  it('marks linked video and document objects as files', () => {
    const videoFiles = deriveWorkFiles(
      {
        id: 'youtube-1',
        title: 'Live set',
        itemKind: 'video',
        source: { provider: 'youtube' },
      },
      []
    );
    expect(videoFiles).toEqual([
      expect.objectContaining({ kind: 'video', name: 'Live set' }),
    ]);

    const docFiles = deriveWorkFiles(
      {
        id: 'doc-1',
        title: 'One sheet',
        itemKind: 'document',
        documentStage: 'draft',
      },
      []
    );
    expect(docFiles).toEqual([
      expect.objectContaining({ kind: 'document', accessLabel: 'Private' }),
    ]);
  });
});
