import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { materializeProofDirectory } from '../apps/docs/scripts/materialize-proof.mjs';

describe('docs proof materialize', () => {
  it('keeps the symlink outside Vercel', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-proof-'));
    try {
      const target = join(root, 'help-center');
      const proof = join(root, 'proof');
      mkdirSync(target);
      writeFileSync(join(target, 'shot.png'), 'png');
      symlinkSync(target, proof);

      const result = materializeProofDirectory(proof, {});
      assert.deepEqual(result, {
        materialized: false,
        reason: 'not-vercel',
      });
      assert.equal(lstatSync(proof).isSymbolicLink(), true);
      assert.equal(readFileSync(join(proof, 'shot.png'), 'utf8'), 'png');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('replaces the symlink with a real directory on Vercel', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-proof-'));
    try {
      const target = join(root, 'help-center');
      const proof = join(root, 'public', 'proof');
      mkdirSync(target);
      mkdirSync(join(root, 'public'));
      writeFileSync(join(target, 'shot.png'), 'png');
      symlinkSync('../help-center', proof);

      const result = materializeProofDirectory(proof, { VERCEL: '1' });
      assert.equal(result.materialized, true);
      assert.equal(result.target, target);
      assert.equal(readFileSync(join(proof, 'shot.png'), 'utf8'), 'png');
      assert.equal(readFileSync(join(target, 'shot.png'), 'utf8'), 'png');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
