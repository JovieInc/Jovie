import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-7797: the Jovie mark and wordmark have one owner, the construction
 * geometry in @jovie/ui/brand (via lib/brand). Hand-copied wordmark outlines
 * and raster wordmark imports drifted four ways before; this keeps them out.
 */
const webRoot = path.resolve(__dirname, '../../..');
const BANNED: ReadonlyArray<readonly [string, string]> = [
  ['0 0 136 39', 'legacy wordmark viewBox (hand-copied outline)'],
  ['M114.928,27.260', 'legacy wordmark path data'],
  ['Jovie-Logo-Wordmark-Alt', 'raster wordmark import'],
  ['M179.16,6 L182.24', 'legacy 360-unit mark path'],
];

describe('brand mark has a single owner (JOV-7797)', () => {
  it('no app, component or lib source redraws the mark or wordmark', () => {
    let out = '';
    try {
      out = execFileSync(
        'git',
        [
          'grep',
          '-n',
          '-F',
          ...BANNED.flatMap(([needle]) => ['-e', needle]),
          '--',
          'app',
          'components',
          'lib',
          ':!*.test.*',
        ],
        { cwd: webRoot, encoding: 'utf8' }
      );
    } catch {
      // git grep exits 1 when nothing matches
    }
    const offenders = out
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const why = BANNED.find(([needle]) => line.includes(needle))?.[1];
        return `${line.split(':').slice(0, 2).join(':')}: ${why}`;
      });
    expect(offenders).toEqual([]);
  }, 30_000);
});
