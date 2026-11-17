// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { printGroupRows, printRows } from './route-js-diagnostics.mjs';

afterEach(() => vi.restoreAllMocks());

it('reports passing, unlisted and over-budget routes with their measured ceilings', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  printRows([
    { ok: true, gzipKb: 687, budgetKb: 687, route: '/app/admin/room' },
    { ok: false, gzipKb: 12, budgetKb: null, route: '/app/new' },
    { ok: false, gzipKb: 688, budgetKb: 687, route: '/app/over' },
  ]);
  expect(log.mock.calls.map(([line]) => line)).toEqual([
    expect.stringMatching(/^ok\s+687 \/\s+687 KB gz  \/app\/admin\/room$/),
    expect.stringMatching(/^NEW\s+12 \/\s+- KB gz  \/app\/new$/),
    expect.stringMatching(/^OVER\s+688 \/\s+687 KB gz  \/app\/over$/),
  ]);
});

it('reports each group against its own baseline and target with the worst route', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  printGroupRows({
    rows: [
      {
        ok: true,
        worstKb: 140,
        baselineKb: 150,
        group: 'marketing',
        targetKb: 150,
        routes: 2,
        worstRoute: '/',
      },
      {
        ok: false,
        worstKb: 688,
        baselineKb: 687,
        group: 'admin',
        targetKb: 300,
        routes: 1,
        worstRoute: '/app/admin/room',
      },
    ],
  });
  expect(log.mock.calls.map(([line]) => line)).toEqual([
    '\nRoute-group initial-JS budgets (JOV-8561)',
    expect.stringMatching(
      /^ok\s+140 \/\s+150 KB gz  marketing group \(target 150 KB; 2 routes; worst \/\)$/
    ),
    expect.stringMatching(
      /^OVER\s+688 \/\s+687 KB gz  admin group \(target 300 KB; 1 routes; worst \/app\/admin\/room\)$/
    ),
  ]);
});
