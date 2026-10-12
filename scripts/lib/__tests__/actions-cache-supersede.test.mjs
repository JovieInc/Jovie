import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { planSuperseded } from '../actions-cache-supersede.mjs';

const tsc = 'jovie-web-tsbuildinfo-v2-Linux-a-h20260926';
const nm = 'pnpm-node-modules-v4-Linux-';
const rows = [
  'Linux-next-build-web-v1-a1-20260925',
  'Linux-next-build-web-v1-b2-2026092614', // hourly supersedes daily
  `${tsc}13`,
  `${tsc}14`,
  `${tsc}15`,
  `${nm}X64-a-c0`,
  `${nm}X64-a-c1`,
  `${nm}ARM64-a-c0`,
  'pnpm-node-modules-v2-Linux-X64-a',
  'Linux-playwright-chromium-a',
  'Linux-playwright-chromium-b',
  'Linux-next-build-web-v1-c-20270101',
].map((key, i) => ({
  id: i + 1,
  key,
  ref: i === 11 ? 'refs/pull/1/merge' : 'refs/heads/main',
  created_at: `2026-09-26T0${[1, 2, 3, 4, 4, 1, 5, 1, 9, 1, 2, 3][i]}:00Z`,
}));
const ids = list => planSuperseded(list).map(c => c.id);

it('keeps the newest per allowlisted main stem, drops dead v1/v2/v3', () => {
  expect(ids(rows).sort((a, b) => a - b)).toEqual([1, 3, 4, 6, 9]);
  expect(ids(rows.slice(9))).toEqual([]);
  const v1 = { ...rows[8], key: 'pnpm-node-modules-v1-Linux-X64-a' };
  expect(ids([v1])).toEqual([9]);
  const v3 = { ...rows[8], key: 'pnpm-node-modules-v3-Linux-X64-a' };
  expect(ids([v3])).toEqual([9]);
});

it('runs inside Actions Cache GC, not as a second listing workflow', () => {
  const workflows = `${import.meta.dirname}/../../../.github/workflows`;
  expect(existsSync(`${workflows}/actions-cache-supersede.yml`)).toBe(false);
  const gc = readFileSync(`${workflows}/actions-cache-gc.yml`, 'utf8');
  expect(gc).toContain('scripts/lib/actions-cache-supersede.mjs');
  expect(gc).toMatch(/^ {2}push:\n {4}branches: \[main\]/m);
  expect(gc).not.toMatch(/^ {2}schedule:/m);
});

it('keeps only the newest evidence cache of each quota-saving family', () => {
  const evidence = [
    'linear-sync-github-v1-0123456789abcdef',
    'linear-sync-github-v1-fedcba9876543210',
    'flaky-run-evidence-d89ae2dafd610782',
    'flaky-run-evidence-38177037625',
  ].map((key, i) => ({
    id: 100 + i,
    key,
    ref: 'refs/heads/main',
    created_at: `2026-10-11T0${i % 2 ? 2 : 1}:00:00Z`,
  }));
  expect(ids(evidence).sort((a, b) => a - b)).toEqual([100, 102]);
});
