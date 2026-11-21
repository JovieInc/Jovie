import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeAliasGraduation } from '../public-profile-alias-graduation.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

export function assertAliasWriter() {
  const dir = mkdtempSync(join(tmpdir(), 'alias-graduation-format-'));
  try {
    const root = pathToFileURL(`${dir}/`);
    const receipt = JSON.parse(
      readFileSync(
        join(
          REPO_ROOT,
          'docs/performance/public-profile-alias-graduation.json'
        ),
        'utf8'
      )
    );
    const evidenceRoot = resolve(REPO_ROOT, 'docs/performance');
    const inventoryText = readFileSync(
      join(evidenceRoot, receipt.evidence.inventory),
      'utf8'
    );
    const measurementsText = readFileSync(
      join(evidenceRoot, receipt.evidence.measurements),
      'utf8'
    );
    writeAliasGraduation({ receipt, inventoryText, measurementsText }, root);
    const path = join(dir, 'public-profile-alias-graduation.json');
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), receipt);
    for (const [file, contents, sha] of [
      [
        receipt.evidence.inventory,
        inventoryText,
        receipt.evidence.inventorySha256,
      ],
      [
        receipt.evidence.measurements,
        measurementsText,
        receipt.evidence.measurementsSha256,
      ],
    ]) {
      const actual = readFileSync(join(dir, file), 'utf8');
      assert.equal(actual, contents);
      assert.equal(createHash('sha256').update(actual).digest('hex'), sha);
    }
    assert.equal(
      readFileSync(path, 'utf8'),
      execFileSync(
        'pnpm',
        [
          'exec',
          'biome',
          'format',
          `--stdin-file-path=${resolve(evidenceRoot, 'public-profile-alias-graduation.json')}`,
        ],
        {
          cwd: REPO_ROOT,
          input: readFileSync(path, 'utf8'),
          encoding: 'utf8',
        }
      )
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
