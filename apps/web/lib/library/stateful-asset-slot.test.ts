import { describe, expect, it } from 'vitest';
import {
  assertPopulatedSlotHidesDropZone,
  LIBRARY_INSPECTOR_ASSET_KINDS,
  projectLibraryInspectorAssetSlot,
  projectLibraryInspectorAssetSlots,
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
      expect(() => assertPopulatedSlotHidesDropZone(populated)).not.toThrow();
    }
  });

  it('projects Library inspector kinds from object state', () => {
    const slots = projectLibraryInspectorAssetSlots(
      {
        itemKind: 'release',
        title: 'Take Me Over',
        previewUrl: 'https://cdn.example.com/a.mp3',
        artworkUrl: 'https://cdn.example.com/a.jpg',
      },
      2
    );
    expect(slots.map(slot => [slot.kind, slot.occupancy])).toEqual([
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
