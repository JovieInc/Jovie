import { describe, expect, it } from 'vitest';
import {
  LIBRARY_INSPECTOR_ASSET_KINDS,
  projectLibraryInspectorAssetSlot,
  resolveStatefulAssetSlot,
} from './stateful-asset-slot';

describe('stateful asset slots', () => {
  it('never shows a drop zone on populated slots', () => {
    const emptyFile = resolveStatefulAssetSlot({
      occupancy: 'empty',
      cardinality: 'single',
      acquireMode: 'file',
    });
    expect(emptyFile.showAcquisitionDropZone).toBe(true);
    expect(
      resolveStatefulAssetSlot({
        occupancy: 'empty',
        cardinality: 'single',
        acquireMode: 'action',
      }).showAcquisitionDropZone
    ).toBe(false);

    for (const kind of LIBRARY_INSPECTOR_ASSET_KINDS) {
      const populated = resolveStatefulAssetSlot({
        occupancy: 'populated',
        cardinality: kind === 'stems' ? 'multi' : 'single',
        acquireMode: 'file',
      });
      expect(populated.mode).toBe('object');
      expect(populated.showAcquisitionDropZone).toBe(false);
    }
  });

  it('projects Library inspector kinds from object state', () => {
    const source = {
      itemKind: 'release',
      title: 'Take Me Over',
      previewUrl: 'https://cdn.example.com/a.mp3',
      artworkUrl: 'https://cdn.example.com/a.jpg',
    };
    expect(
      LIBRARY_INSPECTOR_ASSET_KINDS.map(kind => [
        kind,
        projectLibraryInspectorAssetSlot(kind, source, 2).occupancy,
      ])
    ).toEqual([
      ['audio', 'populated'],
      ['artwork', 'populated'],
      ['video', 'empty'],
      ['docs', 'empty'],
      ['stems', 'populated'],
    ]);
    expect(
      projectLibraryInspectorAssetSlot('video', {
        title: 'Live set',
        source: { provider: 'youtube' },
      }).occupancy
    ).toBe('populated');
  });
});
