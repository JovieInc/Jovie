import { describe, expect, it } from 'vitest';
import {
  LIBRARY_INSPECTOR_ASSET_KINDS,
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
});
