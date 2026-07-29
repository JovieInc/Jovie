import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  classifyRun,
  descendantsOf,
  parsePhysicalFootprint,
  parseProcessTable,
  renderSummary,
  writeArtifacts,
} from './capture-memory-baseline.mjs';

test('process table identifies Electron main and renderer processes', () => {
  const processes = parseProcessTable(`
  100 1 500 /path/launch-electron.mjs
  101 100 120000 /path/Electron.app/Contents/MacOS/Electron .
  102 101 80000 /path/Electron.app/Contents/MacOS/Electron --type=renderer --no-sandbox
  `);

  assert.deepEqual(
    processes.find(process => process.role === 'main'),
    {
      pid: 101,
      ppid: 100,
      rssKb: 120000,
      command: '/path/Electron.app/Contents/MacOS/Electron .',
      role: 'main',
    }
  );
  assert.equal(
    processes.find(process => process.role === 'renderer')?.pid,
    102
  );
});

test('physical footprint parser accepts macOS vmmap summary output', () => {
  assert.equal(
    parsePhysicalFootprint('Physical footprint:         123.4M'),
    123.4
  );
  assert.equal(
    parsePhysicalFootprint('Physical footprint:         987K'),
    0.987
  );
  assert.equal(parsePhysicalFootprint('no footprint'), null);
});

test('descendant cleanup accounting follows the launch process tree', () => {
  const processes = parseProcessTable(`
  100 1 500 launch-electron
  101 100 120000 Electron .
  102 101 80000 Electron --type=renderer
  103 102 20000 Electron --type=gpu-process
  200 1 1000 unrelated
  `);
  assert.deepEqual(
    descendantsOf(processes, 100).map(process => process.pid),
    [100, 101, 102, 103]
  );
});

test('classification distinguishes regression, baseline, and unavailable native proof', () => {
  assert.equal(
    classifyRun({
      growthPercent: 4,
      nativeFootprintAvailable: true,
      childProcessesClean: true,
    }),
    'baseline captured'
  );
  assert.equal(
    classifyRun({
      growthPercent: 21,
      nativeFootprintAvailable: true,
      childProcessesClean: true,
    }),
    'regression detected'
  );
  assert.equal(
    classifyRun({
      growthPercent: 4,
      nativeFootprintAvailable: false,
      childProcessesClean: true,
    }),
    'native leak proof unavailable'
  );
  assert.equal(
    classifyRun({
      growthPercent: 4,
      nativeFootprintAvailable: true,
      childProcessesClean: false,
    }),
    'regression detected'
  );
});

test('artifacts use the requested output directory and include machine metadata plus cleanup status', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'jovie-memory-test-'));
  const metadata = {
    status: 'baseline captured',
    thresholdPercent: 20,
    childProcessesClean: true,
    gitHead: 'test-head',
    nativeFootprintAvailable: true,
    samples: [
      { index: 1, mainRssMb: 10, rendererRssMb: 5, physicalFootprintMb: 20 },
    ],
    growth: {
      mainRssPercent: 0,
      rendererRssPercent: 0,
      physicalFootprintPercent: 0,
    },
  };
  const summary = renderSummary(metadata);
  const paths = await writeArtifacts(outputDir, metadata, summary);
  assert.equal(paths.metadata, join(outputDir, 'metadata.json'));
  assert.equal(paths.summary, join(outputDir, 'summary.md'));
  assert.deepEqual(
    JSON.parse(await readFile(paths.metadata, 'utf8')),
    metadata
  );
  assert.match(await readFile(paths.summary, 'utf8'), /baseline captured/);
});
