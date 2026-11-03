import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findDrift,
  renderDistribution,
  runGenerate,
  writeDistribution,
} from './distribution-io';
import type { DistributionOutput } from './generate';
import { bullets, code, fence, heading, numbered, page } from './markdown';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))
  );
});
const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-dist-'));
  dirs.push(dir);
  return dir;
};
const output = (
  over: Partial<DistributionOutput['issues']> = {}
): DistributionOutput => ({
  files: { 'a.json': '{}\n', 'sub/b.md': 'b\n' },
  toolsListHash: 'h',
  issues: { errors: [], blockers: [], ...over },
});

describe('distribution io', () => {
  it('renders the distribution from the plugin assets', async () => {
    const output = await renderDistribution(
      join(__dirname, '../../plugins/jovie-artists/assets')
    );
    expect(output.toolsListHash).toMatch(/^[0-9a-f]{16,}$/);
    expect(Object.keys(output.files).length).toBeGreaterThan(0);
  });

  it('writes files, removes stale ones and then reports no drift', async () => {
    const dir = await temp();
    await mkdir(join(dir, 'old'), { recursive: true });
    await writeFile(join(dir, 'old/stale.txt'), 'x');
    const log: string[] = [];
    const code = await runGenerate({
      check: false,
      strict: false,
      dir,
      output: output(),
      log: l => log.push(l),
    });
    expect(code).toBe(0);
    expect(await readFile(join(dir, 'sub/b.md'), 'utf8')).toBe('b\n');
    expect(await findDrift(dir, output().files)).toEqual([]);
    expect(log[0]).toContain('Wrote 2 files');
  });

  it('check mode fails on drift and names the regenerate command', async () => {
    const dir = await temp();
    await writeDistribution(dir, output().files);
    await writeFile(join(dir, 'a.json'), '{"x":1}');
    const log: string[] = [];
    const exit = await runGenerate({
      check: true,
      strict: false,
      dir,
      output: output(),
      log: l => log.push(l),
    });
    expect(exit).toBe(1);
    expect(log.join('\n')).toMatch(/Drift in a\.json\. Run: pnpm/);
  });

  it('check mode passes when files match', async () => {
    const dir = await temp();
    await writeDistribution(dir, output().files);
    expect(
      await runGenerate({
        check: true,
        strict: false,
        dir,
        output: output(),
        log: () => {},
      })
    ).toBe(0);
  });

  it('errors always fail, blockers fail only in strict mode', async () => {
    const dir = await temp();
    const run = (
      strict: boolean,
      over: Partial<DistributionOutput['issues']>
    ) =>
      runGenerate({
        check: false,
        strict,
        dir,
        output: output(over),
        log: () => {},
      });
    expect(await run(false, { errors: ['bad'] })).toBe(1);
    expect(await run(false, { blockers: ['title'] })).toBe(0);
    expect(await run(true, { blockers: ['title'] })).toBe(1);
  });
});

describe('markdown helpers', () => {
  it('renders headings, lists and fences', () => {
    expect(heading(2, 'T')).toBe('## T');
    expect(code('x')).toBe('`x`');
    expect(bullets(['a', 'b'])).toBe('- a\n- b');
    expect(numbered(['a', 'b'])).toBe('1. a\n2. b');
    expect(fence('json', '{}')).toBe('```json\n{}\n```');
    expect(page(['a', 'b'])).toBe('a\n\nb\n');
  });
});
