import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FactoryStageArtifact } from '../../data/marketing/factory/spine';
import type { RouteJudges } from '../design-ci-judge-dispatch';
import { loadFactoryBrief } from './brief';
import {
  captureBytesDigest,
  renderContentDigest,
  verifyCaptureBytes,
  verifyRenderBytes,
} from './capture-integrity';
import { capturePng } from './capture-integrity.fixtures';
import { dryProviders } from './providers';
import {
  digestOf,
  type FactoryRunManifest,
  readJson,
  type StageAttemptRecord,
  verifyFactoryRun,
  writeImmutableJson,
  writeJson,
} from './receipts';
import { fixtureCaptures } from './render-measurer';
import { runFactory } from './run';
import { runVisualReview } from './visual-review';

const dirs: string[] = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), 'capture-integrity-'));
  dirs.push(path);
  return path;
};
afterEach(() => {
  for (const path of dirs.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const brief = loadFactoryBrief('solutions', 'founders');
const metrics = { cls: 0, lcpMs: 900 };
const artifact = (): FactoryStageArtifact<'render'> => ({
  pageId: 'solutions-founders',
  route: brief.route,
  ...metrics,
  captures: fixtureCaptures(brief.route, metrics),
});

it('identifies decoded pixels independently of PNG encoding, timing, paths, dimensions and capture ordering', async () => {
  const before = artifact();
  const dir = directory();
  before.captures = before.captures!.map(capture => {
    const bytes = capturePng(capture.width, capture.height, 80, 0);
    const path = join(dir, `before-${capture.viewport}.png`);
    writeFileSync(path, bytes);
    return {
      ...capture,
      screenshot: { path, digest: captureBytesDigest(bytes) },
    };
  });
  const after = {
    ...before,
    cls: 0.01,
    lcpMs: 901,
    captures: before
      .captures!.map(capture => {
        const bytes = capturePng(capture.width, capture.height, 80, 9);
        const path = join(dir, `after-${capture.viewport}.png`);
        writeFileSync(path, bytes);
        return {
          ...capture,
          cls: 0.01,
          lcpMs: 901,
          screenshot: { path, digest: captureBytesDigest(bytes) },
        };
      })
      .reverse(),
  };
  expect(before.captures[0]!.screenshot.digest).not.toBe(
    after.captures[1]!.screenshot.digest
  );
  expect(await renderContentDigest(after)).toBe(
    await renderContentDigest(before)
  );
  expect(verifyRenderBytes(before, 'live')).toEqual([]);
  for (const captures of [
    [before.captures[0]!],
    [before.captures[0]!, before.captures[0]!],
  ]) {
    expect(verifyRenderBytes({ ...before, captures }, 'live')).toContain(
      'capture-integrity: expected exactly one mobile and one desktop capture'
    );
  }
  const wrongGeometry = {
    ...after,
    captures: after.captures.map(capture => ({
      ...capture,
      width: capture.width + 1,
    })),
  };
  expect(await renderContentDigest(wrongGeometry)).toBe(
    await renderContentDigest(before)
  );
  expect(verifyCaptureBytes(wrongGeometry.captures).join(' ')).toContain(
    'unsupported viewport geometry'
  );
  const changed = after.captures[0]!;
  const bytes = capturePng(changed.width, changed.height + 200, 150);
  writeFileSync(changed.screenshot.path, bytes);
  changed.screenshot.digest = captureBytesDigest(bytes);
  expect(verifyCaptureBytes(after.captures)).toEqual([]); // Full-page height may exceed the viewport.
  expect(await renderContentDigest(after)).not.toBe(
    await renderContentDigest(before)
  );
});

it('fails missing, replaced and fixture-labelled live captures before any judge is called', async () => {
  const captures = artifact().captures!;
  const path = join(directory(), 'mobile.png');
  const originalPng = capturePng(390, 844);
  writeFileSync(path, originalPng);
  const original = {
    ...captures[0]!,
    screenshot: { path, digest: captureBytesDigest(originalPng) },
  };
  const run = vi.fn();
  const judges = {
    cheap: { id: 'openai/gpt-5.6-luna', run },
    flagship: { id: 'zai/glm-5.3', run },
  } as RouteJudges;
  expect(verifyCaptureBytes([original])).toEqual([]);
  for (const change of ['replace', 'remove', 'fixture']) {
    if (change === 'replace') writeFileSync(path, 'replacement');
    if (change === 'remove') rmSync(path);
    const review = await runVisualReview(
      {
        pageId: 'solutions-founders',
        captures: change === 'fixture' ? captures : [original],
        producerModel: 'anthropic/claude-opus-5.5',
      },
      judges
    );
    expect(review).toMatchObject({
      status: 'reviewed',
      verdict: 'fail',
      judgeModel: 'capture-integrity',
    });
    expect(run).not.toHaveBeenCalled();
  }
});

it('refuses to overwrite immutable records', () => {
  const path = join(directory(), 'record.json');
  writeImmutableJson(path, { version: 1 });
  expect(() => writeImmutableJson(path, { version: 2 })).toThrow();
  expect(readJson(path)).toEqual({ version: 1 });
});

function providersForRework(revise: boolean) {
  let renders = 0;
  const reviewed: string[][] = [];
  const providers = dryProviders(brief, {
    async generate(request) {
      const value = brief.dry?.[request.stage];
      if (request.stage !== 'copy' || !revise || request.feedback.length === 0)
        return { status: 'ok', value };
      const copy = value as { slots: { slot: string; text: string }[] };
      return {
        status: 'ok',
        value: {
          slots: copy.slots.map(slot =>
            slot.slot === 'subhead'
              ? {
                  ...slot,
                  text: 'One public page that turns visitors into subscribers you can reach again.',
                }
              : slot
          ),
        },
      };
    },
    async measureRender(route, at) {
      const record = readJson<{ copy: unknown }>(
        join(
          at!.preview!.runsDir,
          at!.preview!.recordId.replace('.', '-'),
          'page-record.json'
        )
      );
      const copy = JSON.stringify(record.copy);
      const lcpMs = 900 + renders++;
      return {
        status: 'ok',
        cls: 0,
        lcpMs,
        captures: fixtureCaptures(route, { cls: 0, lcpMs }).map(capture => {
          const path = join(at!.outDir!, `${capture.viewport}.png`);
          // Unit fixture bytes intentionally depend only on visible copy, not receipt metadata.
          const bytes = capturePng(
            capture.width,
            capture.height,
            revise && copy.includes('One public page that turns') ? 150 : 80,
            renders === 1 ? 0 : 9
          );
          writeFileSync(path, bytes, { flag: 'wx' });
          return {
            ...capture,
            screenshot: { path, digest: captureBytesDigest(bytes) },
          };
        }),
      };
    },
    async reviewVisual(request) {
      reviewed.push(request.captures.map(capture => capture.screenshot.digest));
      return {
        status: 'reviewed',
        judgeModel: 'fixture:google/gemini-3-pro',
        verdict: reviewed.length === 1 ? 'fail' : 'pass',
        score: reviewed.length === 1 ? 0.3 : 0.9,
        findings: reviewed.length === 1 ? ['[copy] shorten the subhead'] : [],
        judges: [],
      };
    },
  });
  return { providers, reviewed };
}

async function rework(revise: boolean, mode: 'dry' | 'live' = 'dry') {
  const runsDir = directory();
  const setup = providersForRework(revise);
  const manifest = await runFactory({
    family: 'solutions',
    slug: 'founders',
    runsDir,
    providers: { ...setup.providers, mode },
  });
  const runDir = join(runsDir, 'solutions-founders');
  const renderRecords = manifest.attempts
    .map(file => readJson<StageAttemptRecord>(join(runDir, file)))
    .filter(record => record.receipt.stage === 'render');
  return { ...setup, manifest, runDir, runsDir, renderRecords };
}

describe('retained rework evidence', () => {
  it('blocks the same pixels with changed LCP and new paths before a second review', async () => {
    const result = await rework(false);
    expect(result.manifest).toMatchObject({
      status: 'failed',
      stoppedAt: 'render',
      reason: expect.stringContaining('no new render'),
    });
    expect(result.reviewed).toHaveLength(1);
    const [before, after] = result.renderRecords.map(
      record => record.artifact as FactoryStageArtifact<'render'>
    );
    expect(before!.captures![0]!.screenshot.path).not.toBe(
      after!.captures![0]!.screenshot.path
    );
    expect(before!.lcpMs).not.toBe(after!.lcpMs);
    expect(before!.captures![0]!.screenshot.digest).not.toBe(
      after!.captures![0]!.screenshot.digest
    );
    expect(await renderContentDigest(before!)).toBe(
      await renderContentDigest(after!)
    );
    expect(verifyFactoryRun(result.runDir)).toEqual([]);
  });

  it('retains distinct copy rework captures and rejects historical byte/record tampering', async () => {
    const result = await rework(true);
    expect(result.manifest.status).toBe('complete');
    expect(result.reviewed).toHaveLength(2);
    const [before, after] = result.renderRecords.map(
      record => record.artifact as FactoryStageArtifact<'render'>
    );
    expect(await renderContentDigest(before!)).not.toBe(
      await renderContentDigest(after!)
    );
    expect(verifyFactoryRun(result.runDir)).toEqual([]);
    const original = before!.captures![0]!.screenshot;
    const bytes = readFileSync(original.path);
    writeFileSync(original.path, 'overwritten rejected capture');
    expect(verifyFactoryRun(result.runDir).join('\n')).toContain(
      'capture-integrity: digest mismatch'
    );
    writeFileSync(original.path, bytes);
    rmSync(before!.preview!.path);
    expect(verifyFactoryRun(result.runDir).join('\n')).toContain(
      'missing or unreadable capture'
    );
    const file = result.manifest.attempts.find(file =>
      file.includes('13-render')
    )!;
    const record = readJson<StageAttemptRecord>(join(result.runDir, file));
    writeJson(join(result.runDir, file), {
      ...record,
      artifact: { ...before, lcpMs: 100 },
    });
    expect(verifyFactoryRun(result.runDir).join('\n')).toContain(
      'retained artifact digest'
    );
  });

  it('rejects an unparseable retained render artifact even with a matching JSON digest', async () => {
    const result = await rework(true);
    const file = result.manifest.attempts.find(file =>
      file.includes('13-render')
    )!;
    const record = readJson<StageAttemptRecord>(join(result.runDir, file));
    const artifact = { captures: 'missing capture references' };
    writeJson(join(result.runDir, file), {
      ...record,
      artifact,
      receipt: { ...record.receipt, outputDigest: digestOf(artifact) },
    });
    expect(verifyFactoryRun(result.runDir).join('\n')).toContain(
      'retained render artifact fails the render schema'
    );
  });

  it('binds an archived live render receipt to its chain before checking retained captures', async () => {
    // Live byte/config validation with controlled providers: no model or network calls.
    const result = await rework(true, 'live');
    expect(result.manifest).toMatchObject({ status: 'complete', mode: 'live' });
    expect(verifyFactoryRun(result.runDir)).toEqual([]);
    await runFactory({
      family: 'solutions',
      slug: 'founders',
      runsDir: result.runsDir,
      dry: true,
    });
    const history = readdirSync(join(result.runDir, 'history'));
    expect(history).toHaveLength(1);
    const archived = join(result.runDir, 'history', history[0]!);
    const manifest = readJson<FactoryRunManifest>(join(archived, 'run.json'));
    expect(manifest.mode).toBe('live');
    const link = manifest.chain.find(link => link.stage === 'render')!;
    const path = join(archived, link.file);
    const record = readJson<StageAttemptRecord>(path);
    expect(verifyFactoryRun(result.runDir)).toEqual([]);
    // Only the discriminator changes: artifact and both output digests stay intact.
    writeJson(path, {
      ...record,
      receipt: { ...record.receipt, stage: 'layout' },
    });
    const relabelled = verifyFactoryRun(result.runDir).join('\n');
    const render = record.artifact as FactoryStageArtifact<'render'>;
    rmSync(render.captures![0]!.screenshot.path);
    const missing = verifyFactoryRun(result.runDir).join('\n');
    expect({ relabelled, missing }).toEqual({
      relabelled: expect.stringMatching(/history\/.*out of spine order/u),
      missing: expect.stringMatching(/history\/.*out of spine order/u),
    });
    expect(missing).toContain('missing or unreadable capture');
    await expect(
      runFactory({
        family: 'solutions',
        slug: 'founders',
        runsDir: result.runsDir,
        dry: true,
        fromStage: 'render',
      })
    ).rejects.toThrow(/history\/.*out of spine order/u);
  });

  it('preserves original attempts and capture paths across resume and fresh runs', async () => {
    const result = await rework(true);
    const file = result.manifest.attempts.find(file =>
      file.includes('13-render')
    )!;
    const original = readFileSync(join(result.runDir, file));
    await runFactory({
      family: 'solutions',
      slug: 'founders',
      runsDir: result.runsDir,
      dry: true,
      fromStage: 'render',
    });
    expect(readFileSync(join(result.runDir, file))).toEqual(original);
    await runFactory({
      family: 'solutions',
      slug: 'founders',
      runsDir: result.runsDir,
      dry: true,
    });
    expect(readFileSync(join(result.runDir, file))).toEqual(original);
    const history = readdirSync(join(result.runDir, 'history'));
    expect(history).toHaveLength(1);
    expect(verifyFactoryRun(result.runDir)).toEqual([]);
    rmSync(join(result.runDir, 'history', history[0]!, 'run.json'));
    await expect(
      runFactory({
        family: 'solutions',
        slug: 'founders',
        runsDir: result.runsDir,
        dry: true,
        fromStage: 'render',
      })
    ).rejects.toThrow(/history\/.*missing or unreadable archived run/u);
  });
});
