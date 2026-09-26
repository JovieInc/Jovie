import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { planSuperseded } from '../actions-cache-supersede.mjs';

const tsc = 'jovie-web-tsbuildinfo-v2-Linux-a-h20260926';
const nm = 'pnpm-node-modules-v2-Linux-';
const rows = [
  'Linux-next-build-web-v1-a1-20260925',
  'Linux-next-build-web-v1-b2-2026092614', // hourly supersedes daily
  `${tsc}13`,
  `${tsc}14`,
  `${tsc}15`,
  `${nm}X64-a-c0`,
  `${nm}X64-a-c1`,
  `${nm}ARM64-a-c0`,
  'pnpm-node-modules-v1-Linux-X64-a',
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

it('keeps the newest per allowlisted main stem, drops dead v1', () => {
  expect(ids(rows).sort((a, b) => a - b)).toEqual([1, 3, 4, 6, 9]);
  expect(ids(rows.slice(9))).toEqual([]);
});

it('runs main-only with only actions: write', () => {
  const wf = readFileSync(
    `${import.meta.dirname}/../../../.github/workflows/actions-cache-supersede.yml`,
    'utf8'
  );
  expect(wf).toContain("github.ref == 'refs/heads/main'");
  expect(wf).toMatch(/^permissions:\n {2}actions: write\n\n/m);
});
