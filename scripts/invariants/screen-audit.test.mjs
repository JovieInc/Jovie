import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  auditScreens,
  changedScreenManifest,
  loadArtifacts,
  proofMeasurementFindings,
  remediationPlans,
  screenProducer,
  specificJudgeFindings,
} from './screen-audit.mjs';

const registry = [
  {
    id: 'web.marketing-launch',
    platform: 'web',
    owner: 'm',
    sources: [],
    viewports: ['desktop'],
  },
  {
    id: 'web.homepage',
    platform: 'web',
    owner: 'm',
    sources: [],
    viewports: ['desktop'],
  },
  {
    id: 'web.tasks',
    platform: 'web',
    owner: 'app',
    sources: [],
    viewports: ['desktop'],
  },
  {
    id: 'web.public-profile',
    platform: 'web',
    owner: 'p',
    sources: [],
    viewports: ['desktop'],
  },
  {
    id: 'ios.chat',
    platform: 'ios',
    owner: 'ios',
    sources: [],
    viewports: ['iphone'],
  },
  {
    id: 'web.gone',
    platform: 'web',
    owner: 'x',
    sources: [],
    viewports: [],
    excluded: true,
  },
];

const passingViewport = {
  id: 'desktop',
  rendered: true,
  axe: { violations: 0 },
  overflow: { maxHorizontalPx: 0 },
  cls: { value: 0 },
  interaction: { passed: true },
  contrast: { passed: true },
  runtime: { consoleErrors: 0 },
};

describe('screen audit', () => {
  it('maps producers from the certification route tables', () => {
    assert.equal(screenProducer('web.homepage').kind, 'marketing-route');
    assert.equal(screenProducer('web.tasks').kind, 'proof-route');
    assert.equal(screenProducer('ios.chat').kind, 'none');
  });

  it('never counts missing evidence or a missing producer as green', () => {
    const ledger = auditScreens({ registry });
    const byId = Object.fromEntries(ledger.screens.map(s => [s.id, s.verdict]));
    assert.deepEqual(byId, {
      'web.marketing-launch': 'missing-evidence',
      'web.homepage': 'missing-evidence',
      'web.tasks': 'missing-evidence',
      'web.public-profile': 'missing-evidence',
      'ios.chat': 'uncovered',
    });
    assert.equal(ledger.totals.screens, 5);
    assert.equal(ledger.totals.green, undefined);
  });

  it('turns route DOM and proof measurements into specific red findings', () => {
    const ledger = auditScreens({
      registry,
      routeDom: new Map([
        [
          '/launch',
          [
            {
              viewport: 'mobile',
              state: 'default',
              findings: [
                { kind: 'clipped-heading', elements: ['h1#hero-heading'] },
              ],
            },
          ],
        ],
        ['/', [{ viewport: 'desktop', state: 'default', findings: [] }]],
        [
          '/unfazed',
          [
            {
              viewport: '390x844',
              state: 'menu',
              findings: [{ kind: 'image-contrast', elements: ['span'] }],
            },
          ],
        ],
      ]),
      proofs: new Map([
        [
          'web.tasks',
          {
            screenId: 'web.tasks',
            viewports: [{ ...passingViewport, cls: { value: 0.27 } }],
          },
        ],
      ]),
    });
    const byId = Object.fromEntries(ledger.screens.map(s => [s.id, s]));
    assert.equal(byId['web.homepage'].verdict, 'green');
    assert.deepEqual(byId['web.marketing-launch'].findings, [
      'mobile: clipped-heading h1#hero-heading',
    ]);
    assert.deepEqual(byId['web.public-profile'].findings, [
      '390x844/menu: image-contrast span',
    ]);
    assert.match(byId['web.tasks'].findings[0], /CLS 0.27 over 0.05/);
    assert.equal(byId['web.tasks'].verdict, 'red');
  });

  it('reports every failing proof measurement and none for a clean proof', () => {
    assert.deepEqual(
      proofMeasurementFindings({ viewports: [passingViewport] }),
      []
    );
    const findings = proofMeasurementFindings({
      viewports: [
        {
          id: 'mobile',
          rendered: false,
          axe: { violations: 2 },
          overflow: { maxHorizontalPx: 12 },
          interaction: { passed: false },
          contrast: { passed: false },
          runtime: { pageErrors: 1 },
        },
      ],
    });
    assert.deepEqual(findings, [
      'viewport mobile: not rendered',
      'viewport mobile: 2 axe violations',
      'viewport mobile: horizontal overflow 12px',
      'viewport mobile: CLS unmeasured over 0.05',
      'viewport mobile: interaction check failed',
      'viewport mobile: contrast check failed',
      'viewport mobile: 1 pageErrors',
    ]);
  });

  it('does not count empty or incomplete proof measurements as green', () => {
    for (const viewports of [
      undefined,
      [],
      [{ ...passingViewport, id: 'mobile' }],
    ]) {
      const ledger = auditScreens({
        registry: registry.filter(screen => screen.id === 'web.tasks'),
        proofs: new Map([['web.tasks', { screenId: 'web.tasks', viewports }]]),
      });
      assert.equal(ledger.screens[0].verdict, 'red');
      assert.match(
        ledger.screens[0].findings.join('\n'),
        /viewport.*unmeasured/
      );
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      assert.match(
        proofMeasurementFindings({
          viewports: [
            {
              ...passingViewport,
              cls: { value },
              overflow: { maxHorizontalPx: value },
            },
          ],
        }).join('\n'),
        /CLS/
      );
      assert.match(
        proofMeasurementFindings({
          viewports: [
            {
              ...passingViewport,
              cls: { value },
              overflow: { maxHorizontalPx: value },
            },
          ],
        }).join('\n'),
        /horizontal overflow/
      );
    }
  });

  it('blocks on specific judge findings only', () => {
    const judged = specificJudgeFindings([
      {
        principle: 'seams',
        finding: 'header strip inset from panel',
        evidence: 'desktop y=40',
      },
      { principle: 'seams', finding: 'feels off', evidence: '' },
      { principle: 'vibes', finding: 'meh', evidence: 'screenshot' },
    ]);
    assert.equal(judged.length, 1);
    const ledger = auditScreens({
      registry: registry.slice(1, 2),
      routeDom: new Map([['/', [{ viewport: 'desktop', findings: [] }]]]),
      judge: {
        'web.homepage': [
          {
            principle: 'subtraction',
            finding: 'two primary CTAs',
            evidence: 'hero',
          },
        ],
      },
    });
    assert.equal(ledger.screens[0].verdict, 'red');
    assert.equal(ledger.screens[0].judge, 'judged');
    assert.match(
      ledger.screens[0].findings[0],
      /^judge subtraction: two primary CTAs/
    );
    const vague = auditScreens({
      registry: registry.slice(1, 2),
      routeDom: new Map([['/', [{ viewport: 'desktop', findings: [] }]]]),
      judge: {
        'web.homepage': [
          { principle: 'intent', finding: 'unclear', evidence: ' ' },
        ],
      },
    });
    assert.equal(vague.screens[0].verdict, 'green');
  });

  it('plans one stable remediation issue per red screen plus coverage rollups', () => {
    const ledger = auditScreens({
      registry,
      headSha: 'abcdef0123456789',
      routeDom: new Map([
        [
          '/launch',
          [
            {
              viewport: 'desktop',
              findings: [{ kind: 'orphaned-line', elements: ['h2'] }],
            },
          ],
        ],
      ]),
    });
    const plans = remediationPlans(ledger);
    assert.deepEqual(
      plans.map(plan => plan.fingerprint),
      [
        'screen-audit:web.marketing-launch',
        'screen-audit:uncovered',
        'screen-audit:missing-evidence',
      ]
    );
    assert.match(plans[0].title, /has 1 finding$/);
    assert.match(plans[0].description, /on abcdef012345/);
    assert.match(plans[1].description, /- ios\.chat \(ios, ios\)/);
  });

  it('loads route DOM receipts and screen proofs from nested artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'screen-audit-'));
    try {
      const dom = join(root, 'route-dom-certification-sha', 'marketing');
      mkdirSync(dom, { recursive: true });
      writeFileSync(
        join(dom, 'launch-desktop.json'),
        JSON.stringify({
          findings: [{ kind: 'clipped-heading', elements: ['h2'] }],
        })
      );
      writeFileSync(
        join(root, 'route-dom-certification-sha', 'receipt.json'),
        JSON.stringify({
          schemaVersion: 'jovie-route-dom-certification/v1',
          sourceGitSha: 'abc',
          receipts: [
            {
              route: '/launch',
              viewport: 'desktop',
              state: 'default',
              snapshotPath: 'marketing/launch-desktop.json',
            },
          ],
        })
      );
      writeFileSync(
        join(root, 'receipt.json'),
        JSON.stringify({ schemaVersion: 'other' })
      );
      const proofDir = join(root, 'screen-browser-proof-tasks');
      mkdirSync(proofDir);
      writeFileSync(
        join(proofDir, 'screen-proof.json'),
        JSON.stringify({ screenId: 'web.tasks', viewports: [] })
      );
      const loaded = loadArtifacts(root);
      assert.equal(loaded.headSha, 'abc');
      assert.equal(
        loaded.routeDom.get('/launch')[0].findings[0].kind,
        'clipped-heading'
      );
      assert.ok(loaded.proofs.has('web.tasks'));
      assert.deepEqual(loadArtifacts(join(root, 'missing')).proofs.size, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds the per-PR manifest from changed paths', () => {
    const manifest = changedScreenManifest(
      [
        'apps/web/app/(marketing)/launch/page.tsx',
        'apps/web/app/brand-new/page.tsx',
        'README.md',
      ],
      { rows: [] }
    );
    assert.equal(manifest.schema, 'screen-audit-manifest/v1');
    assert.deepEqual(
      manifest.screens.map(s => [s.screenId, s.producer]),
      [['web.marketing-launch', 'marketing-route']]
    );
    assert.deepEqual(manifest.unregistered, [
      'apps/web/app/brand-new/page.tsx',
    ]);
    assert.deepEqual(manifest.requirements, []);
  });

  it('runs the CLI in manifest, ledger and dry-run filing modes', () => {
    const script = join(
      dirname(fileURLToPath(import.meta.url)),
      'screen-audit.mjs'
    );
    const root = mkdtempSync(join(tmpdir(), 'screen-audit-cli-'));
    try {
      const changed = join(root, 'changed.txt');
      writeFileSync(changed, 'apps/web/app/(marketing)/launch/page.tsx\n');
      const manifest = spawnSync(
        process.execPath,
        [script, '--changed', changed],
        { encoding: 'utf8' }
      );
      assert.equal(manifest.status, 0, manifest.stderr);
      assert.equal(
        JSON.parse(manifest.stdout).screens[0].screenId,
        'web.marketing-launch'
      );

      const out = join(root, 'ledger.json');
      const judge = join(root, 'judge.json');
      writeFileSync(judge, JSON.stringify({}));
      const ledger = spawnSync(
        process.execPath,
        [
          script,
          '--artifacts',
          root,
          '--judge',
          judge,
          '--out',
          out,
          '--file',
          '--dry-run',
        ],
        { encoding: 'utf8' }
      );
      assert.equal(ledger.status, 0, ledger.stderr);
      assert.match(ledger.stdout, /\[screen-audit\] \{"screens":/);
      assert.match(ledger.stdout, /screen-audit:uncovered/);

      const usage = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      assert.equal(usage.status, 1);
      assert.match(usage.stderr, /usage:/);

      const noKey = spawnSync(
        process.execPath,
        [script, '--artifacts', root, '--file'],
        {
          encoding: 'utf8',
          env: { ...process.env, LINEAR_API_KEY: '', DRY_RUN: '' },
        }
      );
      assert.equal(noKey.status, 1);
      assert.match(noKey.stderr, /missing_linear_api_key/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
