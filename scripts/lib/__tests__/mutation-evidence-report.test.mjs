import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readReportMutants } from '../mutation-diff.mjs';

it('rejects stale source reports and preserves legacy readers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-evidence-report-'));
  const path = join(dir, 'report.json');
  const mutants = [{ status: 'Killed' }];
  const source = 'export const a = 1;';
  const data = { files: { 'a.ts': { source, mutants } } };
  try {
    writeFileSync(path, JSON.stringify(data));
    expect(readReportMutants(path, 'a.ts', 'export const a = 0;')).toBeNull();
    expect(readReportMutants(path, 'a.ts', source)).toEqual(mutants);
    expect(readReportMutants(path, 'a.ts')).toEqual(mutants);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
