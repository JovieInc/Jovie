import { describe, expect, it } from 'vitest';
import {
  buildDurationsMap,
  parseUnitShardLog,
  unmaskPath,
} from './refresh-unit-shard-durations.mjs';

const E = String.fromCharCode(27);
const line = (file, body) =>
  `2026-09-26T07:19:26.95Z  ${E}[32m✓${E}[39m ${E}[45m jsdom ${E}[49m ${file} ${body}`;

describe('parseUnitShardLog', () => {
  it('reads per-file test ms, unmasks values and paths, and stops at the quarantine step', () => {
    const log = [
      line('t/a.test.ts', '(64 tests) 59ms'),
      line('t/b.test.tsx', `(66 tests)${E}[33m 3755${E}[2mms`),
      `2026-09-26T07:19:26.95Z    ${E}[32m✓${E}[39m nested test name (20)`,
      line('components/***/Card.test.tsx', '(2 tests) 367***ms'),
      line('t/***/ambiguous.test.ts', '(1 test) 5ms'),
      '2026-09-26T07:19:27Z ##[group]Run pnpm turbo test:fast --affected -- --pool=forks --maxWorkers=2 --retry=2 t/a.test.ts',
      line('t/quarantined.test.ts', '(5 tests) 9999ms'),
    ].join('\n');
    const known = [
      'components/jovie/Card.test.tsx',
      't/x/ambiguous.test.ts',
      't/y/ambiguous.test.ts',
    ];
    expect(Object.fromEntries(parseUnitShardLog(log, known))).toEqual({
      't/a.test.ts': { ms: 59, masked: false },
      't/b.test.tsx': { ms: 3755, masked: false },
      'components/jovie/Card.test.tsx': { ms: 3671, masked: true },
    });
    expect(unmaskPath('a/***.test.ts', ['c/d.test.ts'])).toBeUndefined();
  });
});

describe('buildDurationsMap', () => {
  it('keeps heavy files by median clean reading and defaults the rest', () => {
    const map = buildDurationsMap(
      [
        new Map([
          ['z.test.ts', { ms: 1000, masked: false }],
          ['a.test.ts', { ms: 3000, masked: true }],
          ['small.test.ts', { ms: 40, masked: false }],
        ]),
        new Map([['z.test.ts', { ms: 3000, masked: false }]]),
        new Map([['z.test.ts', { ms: 2000, masked: false }]]),
      ],
      { minTestMs: 1000, source: { logs: 3 } }
    );
    expect(map.files).toEqual({ 'a.test.ts': 3000, 'z.test.ts': 2000 });
    expect(Object.keys(map.files)).toEqual(['a.test.ts', 'z.test.ts']);
    expect(map).toMatchObject({
      defaultTestMs: 40,
      overheadMs: 700,
      source: { logs: 3 },
    });
  });
});
