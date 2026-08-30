import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  isProcessGone,
  killProcessGroup,
  spawnProcessGroup,
  waitUntilProcessGone,
  withBoundedLifecycle,
} from '../../component-live-storybook-lifecycle.mjs';
import { runComponentShipGate } from '../../component-ship-gate.mjs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const clone = value => structuredClone(value);
const details = result => result.findings.map(item => item.detail).join('\n');
const temps = [];

afterEach(() => {
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
});

describe('live Storybook lifecycle', () => {
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
