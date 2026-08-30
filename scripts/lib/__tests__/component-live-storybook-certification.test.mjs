import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CANONICAL_LIVE_STORIES,
  DELIBERATE_RED_LIVE_FIXTURES,
  evaluateLiveObservation,
  LIVE_INVARIANTS,
  LIVE_VIEWPORTS,
  qualifyNode22,
  runLiveStorybookCertification,
  seededPassingObservations,
  storyIdFromTitleAndExport,
  validateCanonicalStoryInventory,
} from '../../component-live-storybook-certification.mjs';
import {
  findOwnedPlaywrightBrowsers,
  isProcessGone,
  killProcessGroup,
  planOwnedBrowserSignals,
  reapStaleStorybookVitestLeases,
  STORYBOOK_VITEST_OWNER_ARG,
  spawnProcessGroup,
  waitUntilProcessGone,
  withBoundedLifecycle,
} from '../../component-live-storybook-lifecycle.mjs';
import { runComponentShipGate } from '../../component-ship-gate.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone = value => structuredClone(value);
const details = result => result.findings.map(item => item.detail).join('\n');
const temps = [];
const STORYBOOK_CONFIG = resolve(
  import.meta.dirname,
  '../../../apps/web/.storybook/main.ts'
);
const REPO_ROOT = resolve(import.meta.dirname, '../../../');
const LIFECYCLE_MODULE_URL = pathToFileURL(
  resolve(import.meta.dirname, '../../component-live-storybook-lifecycle.mjs')
).href;
const LIFECYCLE_TEST_TIMEOUT_MS = 30_000;
const ownedPids = [];
const lifecycleIt = process.platform === 'win32' ? it.skip : it;

async function waitFor(predicate, timeoutMs = 15_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started >= timeoutMs) {
      throw new Error(`condition was not met within ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolveExit, rejectExit) => {
    const timer = setTimeout(() => {
      rejectExit(
        new Error(`child ${child.pid} did not exit within ${timeoutMs}ms`)
      );
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
}

async function spawnLifecycleHarness(action, timeoutMs = 5_000) {
  const dir = mkdtempSync(join(tmpdir(), 'storybook-vitest-owner-test-'));
  temps.push(dir);
  const readyFile = join(dir, 'ready.json');
  const helperPidFile = join(dir, 'browser-helper.pid');
  const helperSignalFile = join(dir, 'browser-helper-signals.log');
  const browserExecutable = join(dir, 'chromium');
  symlinkSync(process.execPath, browserExecutable);
  // The helper's newline must survive three parse levels (this file -> the
  // generated module -> the browser shim -> the helper). A `\n` escape collapses
  // to a real newline mid-chain and breaks the helper, so build it at runtime.
  const browserScript = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const helper = spawn(
      process.execPath,
      [
        '-e',
        "const { appendFileSync } = require('node:fs'); const NL = String.fromCharCode(10); process.on('SIGTERM', () => appendFileSync(process.argv[1], 'SIGTERM' + NL)); appendFileSync(process.argv[1], 'READY' + NL); setInterval(() => {}, 1000)",
        process.argv[2],
      ],
      { stdio: 'ignore' }
    );
    helper.unref();
    writeFileSync(process.argv[1], String(helper.pid));
    setInterval(() => {}, 1000);
  `;
  const script = `
    import { spawn } from 'node:child_process';
    import { existsSync, readFileSync, writeFileSync } from 'node:fs';
    import {
      STORYBOOK_VITEST_OWNER_ARG,
      startStorybookVitestLifecycle,
    } from ${JSON.stringify(LIFECYCLE_MODULE_URL)};

    const controller = ${JSON.stringify(action)} === 'controller-cancel'
      ? spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 500)'], {
          detached: true,
          stdio: 'ignore',
        })
      : null;
    controller?.unref();
    const lifecycle = await startStorybookVitestLifecycle({
      leaseDir: ${JSON.stringify(dir)},
      runMode: true,
      timeoutMs: ${timeoutMs},
      controllerPids: controller ? [controller.pid] : undefined,
    });
    const duplicate = ${JSON.stringify(action)} === 'duplicate'
      ? await startStorybookVitestLifecycle({
          leaseDir: ${JSON.stringify(dir)},
          token: lifecycle.token,
          runMode: true,
          timeoutMs: ${timeoutMs},
        })
      : null;
    const browser = spawn(
      ${JSON.stringify(browserExecutable)},
      [
        '-e',
        ${JSON.stringify(browserScript)},
        ${JSON.stringify(helperPidFile)},
        ${JSON.stringify(helperSignalFile)},
        '--',
        STORYBOOK_VITEST_OWNER_ARG + lifecycle.token,
        '--user-data-dir=' + lifecycle.tempRoot + '/playwright_chromiumdev_profile-fixture',
      ],
      { detached: true, stdio: 'ignore' }
    );
    browser.unref();
    while (!existsSync(${JSON.stringify(helperPidFile)})) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    while (!existsSync(${JSON.stringify(helperSignalFile)})) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const helperPid = Number(readFileSync(${JSON.stringify(helperPidFile)}, 'utf8'));
    writeFileSync(
      ${JSON.stringify(readyFile)},
      JSON.stringify({
        ownerPid: process.pid,
        browserPid: browser.pid,
        helperPid,
        helperSignalFile: ${JSON.stringify(helperSignalFile)},
        token: lifecycle.token,
        tempRoot: lifecycle.tempRoot,
        leasePath: lifecycle.leasePath,
        duplicateTempRoot: duplicate?.tempRoot ?? null,
      })
    );

    if (
      ${JSON.stringify(action)} === 'success' ||
      ${JSON.stringify(action)} === 'duplicate'
    ) {
      setTimeout(() => process.exit(0), 100);
    } else if (${JSON.stringify(action)} === 'failure') {
      setTimeout(() => { throw new Error('deliberate lifecycle failure'); }, 100);
    } else {
      setInterval(() => {}, 1000);
    }
  `;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    }
  );
  ownedPids.push(child.pid);
  await waitFor(() => existsSync(readyFile));
  const ready = JSON.parse(readFileSync(readyFile, 'utf8'));
  ownedPids.push(ready.browserPid, ready.helperPid);
  return { child, ready };
}

async function expectLifecycleArtifactsGone(ready) {
  expect(await waitUntilProcessGone(ready.browserPid, 10_000)).toBe(true);
  expect(await waitUntilProcessGone(ready.helperPid, 10_000)).toBe(true);
  await waitFor(
    () => !existsSync(ready.leasePath) && !existsSync(ready.tempRoot)
  );
  expect(existsSync(ready.leasePath)).toBe(false);
  expect(existsSync(ready.tempRoot)).toBe(false);
  expect(readFileSync(ready.helperSignalFile, 'utf8')).toContain('SIGTERM');
}

function readStorybookAddons(liveCertMarker) {
  const env = { ...process.env };
  if (liveCertMarker === undefined) {
    delete env.JOVIE_LIVE_STORYBOOK_CERT;
  } else {
    env.JOVIE_LIVE_STORYBOOK_CERT = liveCertMarker;
  }
  const loader = `
    import configModule from ${JSON.stringify(STORYBOOK_CONFIG)};
    const config = configModule.default ?? configModule;
    process.stdout.write(JSON.stringify(config.addons ?? null));
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', loader],
      { cwd: REPO_ROOT, encoding: 'utf8', env }
    )
  );
}

function createAxeConcurrencyFixture() {
  let active = false;
  let releaseActiveRun = null;
  return {
    run(label) {
      if (active) {
        return Promise.reject(
          new Error(
            'Axe is already running. Use await axe.run() to wait for the previous run to finish before starting a new run.'
          )
        );
      }
      active = true;
      return new Promise(resolve => {
        releaseActiveRun = () => {
          active = false;
          releaseActiveRun = null;
          resolve(label);
        };
      });
    },
    release() {
      releaseActiveRun?.();
    },
  };
}

async function runAxeRunners(addons) {
  const axe = createAxeConcurrencyFixture();
  const runs = [];
  if (addons.includes('@storybook/addon-a11y')) {
    runs.push(axe.run('storybook automatic scan'));
  }
  runs.push(axe.run('custom live-cert scan'));
  axe.release();
  return Promise.allSettled(runs);
}

afterEach(() => {
  for (const pid of ownedPids.splice(0)) {
    killProcessGroup({ pid }, 'SIGKILL');
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('live Storybook component certification', () => {
  it('qualifies exact Node 22 and rejects other majors', () => {
    expect(qualifyNode22('22.23.2').ok).toBe(true);
    expect(qualifyNode22('22.13.0').ok).toBe(true);
    expect(qualifyNode22('20.19.0').ok).toBe(false);
    expect(qualifyNode22('24.5.0').ok).toBe(false);
    expect(qualifyNode22('24.5.0').detail).toMatch(/requires Node 22\.x/);
  });

  it('computes Storybook CSF ids from title and export name', () => {
    expect(storyIdFromTitleAndExport('UI/Atoms/Badge', 'Default')).toBe(
      'ui-atoms-badge--default'
    );
    expect(storyIdFromTitleAndExport('UI/Atoms/Badge', 'Tones')).toBe(
      'ui-atoms-badge--tones'
    );
    expect(storyIdFromTitleAndExport('shadcn/Button', 'Primary')).toBe(
      'shadcn-button--primary'
    );
    expect(storyIdFromTitleAndExport('UI/Atoms/Card', 'Hoverable')).toBe(
      'ui-atoms-card--hoverable'
    );
  });

  it('validates exact canonical story ids and import paths before evaluation', () => {
    const result = validateCanonicalStoryInventory();
    expect(result.ok).toBe(true);
    expect(result.stories.map(item => item.id)).toEqual([
      'ui-atoms-badge--default',
      'ui-atoms-badge--tones',
      'shadcn-button--primary',
      'ui-atoms-card--default',
      'ui-atoms-card--hoverable',
    ]);
    const broken = clone(CANONICAL_LIVE_STORIES);
    broken[0].id = 'ui-atoms-badge--wrong';
    expect(validateCanonicalStoryInventory({ stories: broken }).ok).toBe(false);
    broken[0].id = 'ui-atoms-badge--default';
    broken[0].importPath = 'apps/web/components/fake.stories.tsx';
    expect(
      validateCanonicalStoryInventory({ stories: broken }).issues.join('\n')
    ).toMatch(/canonical import path/);
  });

  it('fails closed when a canonical story file or export is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'live-sb-inv-'));
    temps.push(root);
    mkdirSync(join(root, 'packages/ui/atoms'), { recursive: true });
    writeFileSync(
      join(root, 'packages/ui/atoms/badge.stories.tsx'),
      "const meta = { title: 'UI/Atoms/Badge' };\nexport const Tones = {};\n"
    );
    const stories = [
      {
        ...CANONICAL_LIVE_STORIES[0],
        importPath: 'packages/ui/atoms/badge.stories.tsx',
      },
    ];
    const result = validateCanonicalStoryInventory({
      repoRoot: root,
      stories: [...stories, ...CANONICAL_LIVE_STORIES.slice(1)],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toMatch(/Default is not declared|missing/);
  });

  it('accepts five seeded primitive stories at desktop and compact viewports', () => {
    const samples = seededPassingObservations();
    expect(samples).toHaveLength(
      CANONICAL_LIVE_STORIES.length * LIVE_VIEWPORTS.length
    );
    for (const sample of samples) {
      expect(evaluateLiveObservation(sample).ok, sample.id).toBe(true);
    }
    const result = runLiveStorybookCertification({
      headSha: HEAD,
      nodeVersion: '22.23.2',
      observations: samples,
    });
    expect(result.ok).toBe(true);
    expect(result.receipt.liveVisualCertification).toMatchObject({
      status: 'certified',
      certified: 5,
      claimBoundary: 'enrolled-canonical-primitive-stories-only',
      viewports: ['desktop', 'compact'],
    });
  });

  it('rejects deliberate-red fixtures for every live invariant class', () => {
    const fingerprints = [
      ['deliberate-red.live.missing-story', /not in the canonical inventory/],
      ['deliberate-red.live.theme-mismatch', /light treatment on dark surface/],
      [
        'deliberate-red.live.semantic-drift',
        /arbitrary color-name variant "red"/,
      ],
      ['deliberate-red.live.off-token-padding', /arbitrary padding/],
      ['deliberate-red.live.off-token-radius', /not a radius token/],
      ['deliberate-red.live.geometry-drift', /anatomy drifted/],
      ['deliberate-red.live.nonconcentric', /outer 16px !== inner 8px/],
      ['deliberate-red.live.aa-contrast', /below WCAG AA/],
      ['deliberate-red.live.axe', /axe violations/],
      ['deliberate-red.live.overflow', /overflows the story frame/],
      ['deliberate-red.live.zoom', /200% zoom/],
      ['deliberate-red.live.keyboard-gap', /not reached by keyboard/],
      ['deliberate-red.live.hover-shift', /hover shifted layout/],
      ['deliberate-red.live.placeholder-copy', /placeholder/],
      ['deliberate-red.live.emoji-checkmark', /emoji or checkmarks/],
      ['deliberate-red.live.decorative-caps', /decorative caps/],
    ];
    expect(DELIBERATE_RED_LIVE_FIXTURES).toHaveLength(fingerprints.length);
    for (const [id, pattern] of fingerprints) {
      const fixture = DELIBERATE_RED_LIVE_FIXTURES.find(item => item.id === id);
      if (!fixture) throw new Error(`missing ${id}`);
      const result = evaluateLiveObservation(fixture);
      expect(result.ok).toBe(false);
      expect(details(result)).toMatch(pattern);
    }
    const leaked = clone(DELIBERATE_RED_LIVE_FIXTURES[1]);
    leaked.fill = { luminance: 'dark', token: 'bg-surface-1' };
    expect(
      runLiveStorybookCertification({
        headSha: HEAD,
        nodeVersion: '22.23.2',
        observations: seededPassingObservations(),
        redFixtures: [leaked],
      }).ok
    ).toBe(false);
  });

  it('records focused V8 coverage of every live invariant via pass and block paths', () => {
    const covered = new Set();
    for (const sample of seededPassingObservations()) {
      const result = evaluateLiveObservation(sample);
      expect(result.ok).toBe(true);
      for (const id of sample.applicable) covered.add(id);
    }
    for (const fixture of DELIBERATE_RED_LIVE_FIXTURES) {
      const result = evaluateLiveObservation(fixture);
      expect(result.ok).toBe(false);
      for (const finding of result.findings) covered.add(finding.invariant);
    }
    expect([...LIVE_INVARIANTS].sort()).toEqual([...covered].sort());
  });

  it('fails closed when a seeded viewport observation is omitted', () => {
    const samples = seededPassingObservations().filter(
      item => item.id !== 'shadcn-button--primary@compact'
    );
    const result = runLiveStorybookCertification({
      headSha: HEAD,
      nodeVersion: '22.23.2',
      observations: samples,
    });
    expect(result.ok).toBe(false);
    expect(result.receipt.issues.join('\n')).toMatch(
      /shadcn-button--primary@compact: seeded primitive observation is missing/
    );
  });

  it('extends component-ship-gate instead of adding a parallel path', () => {
    const report = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      skipLiveStorybook: true,
      headSha: HEAD,
    });
    expect(report.ok).toBe(true);
    expect(report.sections.liveStorybookCertification.skipped).toBe(true);

    const live = runComponentShipGate({
      diffBase: null,
      skipQuality: true,
      skipRatchet: true,
      headSha: HEAD,
      liveObservations: seededPassingObservations(),
      liveNodeVersion: '22.23.2',
    });
    expect(live.ok).toBe(true);
    expect(live.sections.liveStorybookCertification.ok).toBe(true);
    expect(
      live.sections.liveStorybookCertification.receipt.liveVisualCertification
        .status
    ).toBe('certified');
  });

  it('maps compiled react-dom/client before the generic react-dom Storybook alias', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../../apps/web/.storybook/main.ts'),
      'utf8'
    );
    const clientBare = source.indexOf("bare = 'react-dom/client'");
    const genericBare = source.indexOf("bare = 'react-dom';");
    expect(clientBare).toBeGreaterThan(-1);
    expect(genericBare).toBeGreaterThan(clientBare);
    expect(source).toContain('jovie-storybook-react-dom-client-interop');
    expect(source).toContain('jovie-react-dom-client');
  });

  it('omits addon-a11y only from the dedicated live-cert build', () => {
    const normal = readStorybookAddons();
    const live = readStorybookAddons('1');
    const nearMiss = readStorybookAddons('true');

    expect(normal).toContain('@storybook/addon-a11y');
    expect(live).not.toContain('@storybook/addon-a11y');
    expect(nearMiss).toContain('@storybook/addon-a11y');
  });

  it('keeps the deliberate concurrent axe-run fixture red and the live cert green', async () => {
    const normal = await runAxeRunners(readStorybookAddons());
    const live = await runAxeRunners(readStorybookAddons('1'));

    expect(normal).toHaveLength(2);
    expect(normal[0]).toMatchObject({
      status: 'fulfilled',
      value: 'storybook automatic scan',
    });
    const concurrencyFailure = normal[1];
    expect(concurrencyFailure.status).toBe('rejected');
    if (concurrencyFailure.status !== 'rejected') {
      throw new Error('expected the concurrent custom axe run to be rejected');
    }
    expect(concurrencyFailure.reason).toMatchObject({
      message: expect.stringContaining('Axe is already running'),
    });
    expect(live).toEqual([
      { status: 'fulfilled', value: 'custom live-cert scan' },
    ]);
  });
});

describe('live Storybook lifecycle', () => {
  it('selects only the exact owned Playwright profile and never normal Chrome', () => {
    const token = randomUUID();
    const tempRoot = mkdtempSync(
      join(tmpdir(), 'jovie-storybook-vitest-owned-')
    );
    temps.push(tempRoot);
    const rows = [
      {
        pid: 100,
        ppid: 1,
        pgid: 100,
        command:
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --profile-directory=Default',
      },
      {
        pid: 101,
        ppid: 1,
        pgid: 101,
        command:
          'chromium --user-data-dir=/tmp/playwright_chromiumdev_profile-other',
      },
      {
        pid: 102,
        ppid: 1,
        pgid: 102,
        command: `chromium ${STORYBOOK_VITEST_OWNER_ARG}${token}`,
      },
      {
        pid: 103,
        ppid: 1,
        pgid: 103,
        command: `chromium ${STORYBOOK_VITEST_OWNER_ARG}${token}-decoy --user-data-dir=${tempRoot}/playwright_chromiumdev_profile-decoy`,
      },
      {
        pid: 104,
        ppid: 1,
        pgid: 104,
        command: `node /tmp/chromium ${STORYBOOK_VITEST_OWNER_ARG}${token} --user-data-dir=${tempRoot}/playwright_chromiumdev_profile-node-decoy`,
      },
      {
        pid: 105,
        ppid: 1,
        pgid: 105,
        command: `chromium ${STORYBOOK_VITEST_OWNER_ARG}${token} --other=--user-data-dir=${tempRoot}/playwright_chromiumdev_profile-nested-decoy`,
      },
      {
        pid: 106,
        ppid: 1,
        pgid: 106,
        command: `chromium ${STORYBOOK_VITEST_OWNER_ARG}${token} --user-data-dir=${tempRoot}/playwright_chromiumdev_profile-owned`,
      },
    ];

    expect(findOwnedPlaywrightBrowsers(rows, token, tempRoot)).toEqual([
      rows[6],
    ]);
  });

  it('fails closed on missing process data and never group-kills a reused leader', () => {
    const token = randomUUID();
    const tempRoot = mkdtempSync(
      join(tmpdir(), 'jovie-storybook-vitest-plan-')
    );
    temps.push(tempRoot);
    const leaderCommand = `chromium ${STORYBOOK_VITEST_OWNER_ARG}${token} --user-data-dir=${tempRoot}/playwright_chromiumdev_profile-plan`;
    const helperCommand =
      'chromium --type=renderer --field-trial-handle=owned-fixture';
    const commandHash = command =>
      createHash('sha256').update(command).digest('hex');
    const group = {
      leader: {
        pid: 200,
        pgid: 200,
        startedAt: 'Sun Aug 30 15:00:00 2026',
        commandHash: commandHash(leaderCommand),
      },
      members: [
        {
          pid: 200,
          pgid: 200,
          startedAt: 'Sun Aug 30 15:00:00 2026',
          commandHash: commandHash(leaderCommand),
        },
        {
          pid: 201,
          pgid: 200,
          startedAt: 'Sun Aug 30 15:00:00 2026',
          commandHash: commandHash(helperCommand),
        },
      ],
    };
    const reusedRows = [
      {
        pid: 200,
        pgid: 200,
        startedAt: 'Sun Aug 30 15:00:00 2026',
        command:
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --profile-directory=Default',
      },
      {
        pid: 201,
        pgid: 200,
        startedAt: 'Sun Aug 30 15:00:00 2026',
        command: helperCommand,
      },
    ];

    expect(planOwnedBrowserSignals([group], null, token, tempRoot)).toEqual({
      ok: false,
      groupPids: [],
      individualPids: [],
    });
    expect(
      planOwnedBrowserSignals([group], reusedRows, token, tempRoot)
    ).toEqual({ ok: true, groupPids: [], individualPids: [201] });
    expect(
      planOwnedBrowserSignals(
        [group],
        [
          {
            pid: 200,
            pgid: 200,
            startedAt: 'Sun Aug 30 15:00:00 2026',
            command: leaderCommand,
          },
          reusedRows[1],
        ],
        token,
        tempRoot
      )
    ).toEqual({ ok: true, groupPids: [200], individualPids: [] });
  });

  it('treats a defunct zombie process as gone', async () => {
    // A live process (this one) is not gone.
    expect(isProcessGone(process.pid)).toBe(false);
    // Nonexistent or invalid pids are gone regardless of platform.
    expect(isProcessGone(2 ** 22 + 12345)).toBe(true);
    expect(isProcessGone(-1)).toBe(true);
    // On Linux, an orphaned child that is SIGKILLed and never reaped lingers
    // as a `<defunct>` zombie: kill(pid, 0) still succeeds on it, but it is
    // dead and must not block reaping of its process group.
    if (existsSync('/proc/self/stat')) {
      const orphanPidFile = join(
        mkdtempSync(join(tmpdir(), 'jovie-zombie-orphan-')),
        'orphan.pid'
      );
      temps.push(dirname(orphanPidFile));
      const spawner = spawnProcessGroup(
        process.execPath,
        [
          '-e',
          "const { spawn } = require('node:child_process'); const { writeFileSync } = require('node:fs'); const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); orphan.unref(); writeFileSync(process.argv[1], String(orphan.pid));",
          orphanPidFile,
        ],
        { stdio: 'ignore' }
      );
      ownedPids.push(spawner.pid);
      await waitFor(() => existsSync(orphanPidFile));
      const orphanPid = Number(readFileSync(orphanPidFile, 'utf8'));
      ownedPids.push(orphanPid);
      // Kill the spawner first so the orphan loses its parent, then SIGKILL the
      // orphan itself: with no live parent to wait() on it, it becomes a zombie.
      killProcessGroup(spawner, 'SIGKILL');
      expect(await waitUntilProcessGone(spawner.pid, 5_000)).toBe(true);
      process.kill(orphanPid, 'SIGKILL');
      // The orphan stays in the process table as a zombie (kill(pid, 0) works)
      // yet isProcessGone must report it gone.
      expect(await waitUntilProcessGone(orphanPid, 5_000)).toBe(true);
    }
  });

  lifecycleIt(
    'reaps the owned browser group after a successful runner exit',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('success');
      expect((await waitForExit(child)).code).toBe(0);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'deduplicates repeated global setup for the same owner token',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('duplicate');
      expect(ready.duplicateTempRoot).toBe(ready.tempRoot);
      expect((await waitForExit(child)).code).toBe(0);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'reaps the owned browser group after a failed runner exit',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('failure');
      expect((await waitForExit(child)).code).toBe(1);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'reaps the owned browser group when the runner is cancelled',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('controller-cancel');
      const exit = await waitForExit(child);
      expect(
        exit.code === 143 ||
          exit.signal === 'SIGTERM' ||
          exit.signal === 'SIGKILL',
        JSON.stringify(exit)
      ).toBe(true);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'preserves native SIGINT cancellation and reaps the browser group',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('hang');
      child.kill('SIGINT');
      const exit = await waitForExit(child);
      expect(
        exit.code === 130 || exit.signal === 'SIGINT',
        JSON.stringify(exit)
      ).toBe(true);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'bounds a hung runner and reaps its owned browser group on timeout',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('hang', 250);
      const exit = await waitForExit(child);
      expect([143, null]).toContain(exit.code);
      await expectLifecycleArtifactsGone(ready);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  lifecycleIt(
    'reaps a leaderless browser group from its persisted lease on restart',
    async () => {
      const { child, ready } = await spawnLifecycleHarness('hang', 30_000);
      await waitFor(() => {
        const lease = JSON.parse(readFileSync(ready.leasePath, 'utf8'));
        return lease.browserGroups?.some(group =>
          group.members.some(member => member.pid === ready.helperPid)
        );
      });
      const lease = JSON.parse(readFileSync(ready.leasePath, 'utf8'));
      expect(lease.watchdogPid).toBeGreaterThan(0);
      expect(lease.watchdogStartedAt).toEqual(expect.any(String));
      ownedPids.push(lease.watchdogPid);
      killProcessGroup({ pid: lease.watchdogPid }, 'SIGKILL');
      expect(await waitUntilProcessGone(lease.watchdogPid, 10_000)).toBe(true);

      process.kill(ready.browserPid, 'SIGTERM');
      expect(await waitUntilProcessGone(ready.browserPid, 10_000)).toBe(true);
      expect(isProcessGone(ready.helperPid)).toBe(false);
      child.kill('SIGKILL');
      await waitForExit(child);

      const result = await reapStaleStorybookVitestLeases({
        leaseDir: dirname(ready.leasePath),
      });

      expect(result.reapedTokens).toContain(ready.token);
      expect(await waitUntilProcessGone(ready.helperPid, 10_000)).toBe(true);
      expect(existsSync(ready.tempRoot)).toBe(false);
      expect(existsSync(ready.leasePath)).toBe(false);
    },
    LIFECYCLE_TEST_TIMEOUT_MS
  );

  it('kills process groups and removes temp output on timeout', async () => {
    const child = spawnProcessGroup(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: 'ignore' }
    );
    const pid = child.pid;
    expect(pid).toBeGreaterThan(0);
    expect(isProcessGone(pid)).toBe(false);
    let workDir = '';
    await expect(
      withBoundedLifecycle(
        { timeoutMs: 250 },
        async ({ dir, register, signal }) => {
          workDir = dir;
          register(child);
          await new Promise(resolve => {
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
          return true;
        }
      )
    ).rejects.toThrow(/timed out/);
    expect(await waitUntilProcessGone(pid)).toBe(true);
    expect(workDir).not.toBe('');
    expect(existsSync(workDir)).toBe(false);
  });

  it('cleans up process groups on success', async () => {
    const child = spawnProcessGroup(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: 'ignore' }
    );
    const pid = child.pid;
    const dir = await withBoundedLifecycle(
      { timeoutMs: 5_000 },
      async ({ dir, register }) => {
        register(child);
        return dir;
      }
    );
    killProcessGroup(child, 'SIGKILL');
    expect(existsSync(dir)).toBe(false);
    expect(await waitUntilProcessGone(pid)).toBe(true);
  });
});
