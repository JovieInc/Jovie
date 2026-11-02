import { describe, expect, it } from 'vitest';
import { PRODUCT_SHOTS } from '@/lib/screenshots/product-shots';
import shotManifest from '../screenshots/product-shots.manifest.json';
import {
  getStageSpec,
  IMAGERY_STAGES,
  insideStage,
  layerBox,
  layersByDepth,
  parseAspect,
  plateFiles,
  rectsOverlap,
  stageForPlate,
} from './stages';

const SHOTS = shotManifest.shots as Record<
  string,
  { width: number; height: number } | undefined
>;
const shotAspect = (id: string) => {
  const entry = SHOTS[id];
  if (!entry) throw new Error(`no rendered shot ${id}`);
  return entry.width / entry.height;
};

describe('imagery stages registry', () => {
  it('has unique stage and plate ids', () => {
    const ids = IMAGERY_STAGES.map(s => s.id);
    const plates = IMAGERY_STAGES.map(s => s.plate.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(plates).size).toBe(plates.length);
  });

  it('only composites registered product shots', () => {
    const known = new Set(PRODUCT_SHOTS.map(s => s.id));
    for (const stage of IMAGERY_STAGES) {
      for (const layer of stage.layers)
        expect(known.has(layer.shotId)).toBe(true);
    }
  });

  it('uses one accent per stage: plate and light agree (MKT-D19)', () => {
    for (const stage of IMAGERY_STAGES) {
      expect(stage.light.accent).toBe(stage.plate.accent);
    }
  });

  it('keeps every layer on the stage and out of the quiet zone', () => {
    for (const stage of IMAGERY_STAGES) {
      const stageAspect = parseAspect(stage.aspect.desktop);
      for (const layer of stage.layers) {
        const box = layerBox(layer, shotAspect(layer.shotId), stageAspect);
        expect(insideStage(box, 0.02), `${stage.id}/${layer.shotId}`).toBe(
          true
        );
        expect(
          rectsOverlap(box, stage.safeArea),
          `${stage.id}/${layer.shotId}`
        ).toBe(false);
      }
    }
  });

  it('keeps mobile placements on the stage', () => {
    for (const stage of IMAGERY_STAGES) {
      const stageAspect = parseAspect(stage.aspect.mobile);
      for (const layer of stage.layers) {
        if (!layer.mobile || layer.mobile === 'hidden') continue;
        const id = `${layer.shotId}--mobile`;
        const aspect = SHOTS[id] ? shotAspect(id) : shotAspect(layer.shotId);
        const box = layerBox(
          { ...layer.mobile, crop: layer.crop },
          aspect,
          stageAspect
        );
        expect(
          insideStage(box, 0.01),
          `${stage.id}/${layer.shotId} mobile`
        ).toBe(true);
      }
    }
  });

  it('paints the nearest layer last', () => {
    for (const stage of IMAGERY_STAGES) {
      const zs = layersByDepth(stage.layers).map(l => l.depth.z);
      expect(zs).toEqual([...zs].sort((a, b) => a - b));
    }
  });

  it('looks stages and plates up, and fails loudly on unknown ids', () => {
    expect(getStageSpec('profile-depth').plate.id).toBe(
      'stage-profile-depth-v1'
    );
    expect(stageForPlate('stage-setup-flow-v1')?.id).toBe('setup-flow');
    expect(() => getStageSpec('nope')).toThrow(/Unknown imagery stage/);
    expect(plateFiles('p').webp).toBe('/assets/generated/p.webp');
  });

  it('measures a cropped layer by the cropped aspect', () => {
    const full = layerBox(
      { anchor: { x: 0.5, y: 0.5 }, scale: 0.4 },
      2,
      16 / 9
    );
    const cropped = layerBox(
      {
        anchor: { x: 0.5, y: 0.5 },
        scale: 0.4,
        crop: { x: 0, y: 0, w: 1, h: 0.5 },
      },
      2,
      16 / 9
    );
    expect(cropped.h).toBeCloseTo(full.h / 2, 5);
  });
});
