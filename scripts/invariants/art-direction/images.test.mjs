import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SMOOTH_RESIDUAL_MAX,
  analyzePixels,
  checkImages,
  classifyPlate,
} from './images.mjs';

function fill(width, height, paint) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 3;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
    }
  }
  return data;
}

describe('marketing plates', () => {
  it('flags a high-frequency plate and accepts a flat one', () => {
    const rough = analyzePixels(
      fill(32, 32, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255])),
      32,
      32
    );
    const flat = analyzePixels(fill(32, 32, () => [20, 24, 28]), 32, 32);
    assert.ok(rough.residual >= SMOOTH_RESIDUAL_MAX);
    assert.ok(flat.residual < SMOOTH_RESIDUAL_MAX);
  });

  it('flags orange mass, a second hue, and generated-ui', () => {
    const orange = analyzePixels(fill(16, 16, () => [255, 120, 0]), 16, 16);
    assert.ok(orange.orangeMass >= 0.04);
    const split = analyzePixels(
      fill(16, 16, x => (x < 8 ? [0, 180, 255] : [220, 40, 180])),
      16,
      16
    );
    assert.ok(split.secondaryMass >= 0.18);
    const plate = 'apps/web/public/assets/generated/plate.webp';
    assert.deepEqual(
      classifyPlate(plate, { residual: 0, secondaryMass: 0, orangeMass: 0 }, {
        missing: false,
        json: { accent: 'ion', kind: 'generated-ui' },
      }).hard,
      [`generated-ui:${plate}`]
    );
  });

  it('matches the shrink-only baseline', async () => {
    assert.deepEqual((await checkImages()).failures, []);
  });
});
