import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkSurface,
  flagDefaultOff,
  surfaceViolations,
} from './surface-media.mjs';

describe('surface media', () => {
  it('allows canvas only when the file names the flag', () => {
    const file = 'apps/web/components/marketing/Field.tsx';
    assert.deepEqual(surfaceViolations('<canvas />', file), [`canvas:${file}`]);
    assert.deepEqual(
      surfaceViolations('<canvas /> /* NIGHT_DJ_HARMONY_V1 */', file),
      []
    );
    assert.equal(flagDefaultOff('export const NIGHT_DJ_HARMONY_V1_ENABLED = false;'), true);
    assert.equal(flagDefaultOff('export const NIGHT_DJ_HARMONY_V1_ENABLED = true;'), false);
  });

  it('matches the shrink-only baseline and keeps the flag off', () => {
    assert.deepEqual(checkSurface().failures, []);
  });
});
