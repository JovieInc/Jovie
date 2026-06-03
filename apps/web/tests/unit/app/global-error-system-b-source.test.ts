import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_ROOT = join(process.cwd(), 'app');
const sourcePath = join(APP_ROOT, 'global-error.tsx');

const hashMark = String.fromCharCode(35);
const colorFunctionName = ['r', 'g', 'b', 'a'].join('');
const hardcodedHashColorPattern = new RegExp(`${hashMark}[\\da-fA-F]{3,8}\\b`);
const rawAlphaColorPattern = new RegExp(`${colorFunctionName}\\s*\\(`, 'i');
const hardcodedSvgFillPattern = new RegExp(
  `fill=(['"])${hashMark}[\\da-fA-F]{3,8}\\1`
);

describe('Global error System B source tokens', () => {
  it('keeps the fallback free of raw color literals', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(hardcodedHashColorPattern);
    expect(source).not.toMatch(rawAlphaColorPattern);
    expect(source).not.toMatch(hardcodedSvgFillPattern);
    expect(source).toContain("fill='currentColor'");
  });
});
