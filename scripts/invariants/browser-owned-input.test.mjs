import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  browserInputFindings,
  browserInputVerdict,
  INPUT_MATRIX,
  INPUT_SCHEMA,
  inputCells,
  isMissingDeviceEvidence,
  semanticFindings,
  transitionFindings,
} from './browser-owned-input.mjs';
import { auditScreens, remediationPlans } from './screen-audit.mjs';
import { evaluateScreenProof } from './screen-certification.mjs';

const HEAD = 'a'.repeat(40);
const screenId = 'web.public-profile';
const asset = () => ({
  url: 'https://evidence.example/capture',
  digest: `sha256:${'b'.repeat(64)}`,
});
const fields = () =>
  ['email', 'tel'].map(role => ({
    role,
    type: role,
    autocomplete: role,
    inputmode: role,
    name: role,
    label: role,
    visible: true,
  }));
const samples = () =>
  INPUT_MATRIX.phases.map(phase => ({
    phase,
    fields: fields(),
    layoutHeight: 844,
    visualHeight:
      phase === 'platform-ui-visible' || phase === 'value-filled' ? 430 : 844,
    visualOffsetTop: 0,
    scrollY: 12,
    horizontalOverflow: 0,
    layoutShift: 0,
    viewport: { top: 0, bottom: 430, left: 0, right: 390 },
    field: { top: 100, bottom: 140, left: 20, right: 370 },
    fieldHit: true,
    action: { top: 200, bottom: 240, left: 20, right: 370 },
    actionHit: true,
    focused: true,
    actionReachable: true,
    anchorStable: true,
    safeAreaCorrect: true,
    sheetUnclipped: true,
    domValue: 'fixture@example.test',
    appValue: 'fixture@example.test',
    valid: true,
    nodeId: 'input-1',
    submitCount: 1,
    restored: true,
    viewportOscillations: 0,
  }));
const context = { screenId, headSha: HEAD };
const record = cell => ({
  cellId: cell.id,
  status: 'PASS',
  kind: 'real-device',
  headSha: HEAD,
  servedBuildSha: HEAD,
  operator: 'fixture-operator',
  url: 'https://deployment.example/unfazed',
  buildIdentity: asset(),
  osVersion: 'fixture-os',
  browserVersion: 'fixture-browser',
  device: cell.device,
  inputUiVersion: 'fixture-ui',
  capturedAt: '2026-10-15T00:00:00Z',
  recording: asset(),
  screenshots: Object.fromEntries(
    INPUT_MATRIX.phases.map(phase => [phase, asset()])
  ),
  scenarios: Object.fromEntries(
    cell.scenarios.map(scenario => [scenario, 'PASS'])
  ),
  viewportUnits: { vh: 'PASS', dvh: 'PASS', svh: 'PASS' },
  samples: samples(),
});
const evidence = () => ({
  schema: INPUT_SCHEMA,
  records: inputCells(screenId).map(record),
});

// These are detector unit inputs, never real-device certification evidence.
test('matrix composes JOV-6061 and JOV-7713, with sorted unique environments/journeys and explicit debt', () => {
  assert.equal(INPUT_MATRIX.certificationContract, 'jovie.certification/v1');
  assert.deepEqual(INPUT_MATRIX.owners, ['JOV-6061', 'JOV-7201', 'JOV-7713']);
  for (const collection of [INPUT_MATRIX.environments, INPUT_MATRIX.journeys]) {
    const ids = collection.map(item => item.id);
    assert.deepEqual(ids, [...new Set(ids)].sort());
  }
  const platformSource = readFileSync(INPUT_MATRIX.platformAuthority, 'utf8');
  for (const env of INPUT_MATRIX.environments) {
    assert.ok(platformSource.includes(`id: '${env.platformRef}'`));
    assert.ok(['SUPPORTED', 'UNKNOWN', 'BLOCKED'].includes(env.support));
    if (env.support !== 'SUPPORTED') assert.ok(env.reason);
  }
  for (const journey of INPUT_MATRIX.journeys) {
    assert.ok(existsSync(journey.source), journey.source);
    assert.ok(['UNKNOWN', 'BLOCKED'].includes(journey.evidence));
    for (const field of journey.fields)
      assert.ok(INPUT_MATRIX.semantics[field]);
  }
  assert.equal(INPUT_MATRIX.historicalEscapes[0].captureStatus, 'BLOCKED');
  assert.equal(INPUT_MATRIX.historicalEscapes[0].captureRef, null);
  const historical = JSON.parse(
    readFileSync(INPUT_MATRIX.historicalEscapes[0].corpusRef, 'utf8')
  );
  assert.equal(historical.replayStatus, 'BLOCKED');
  assert.equal(historical.commissioningIssue, 'JOV-8387');
});

test('all declared semantic roles reject wrong type/token/mode, unlabeled or hidden fields', () => {
  for (const [role, spec] of Object.entries(INPUT_MATRIX.semantics)) {
    const field = {
      role,
      type: spec.types[0],
      autocomplete: spec.autocomplete,
      inputmode: spec.inputmode,
      name: role,
      label: role,
      visible: true,
    };
    assert.deepEqual(semanticFindings([field], [role]), []);
    for (const patch of [
      { type: 'search' },
      { autocomplete: '' },
      { autocomplete: 'off' },
      { inputmode: 'none' },
      { name: '' },
      { label: '' },
      { visible: false },
    ])
      assert.ok(semanticFindings([{ ...field, ...patch }], [role]).length);
    assert.ok(
      semanticFindings(
        [field, { ...field, role: null, visible: false }],
        [role]
      ).some(f => f.includes('autofill-decoy'))
    );
  }
});

test('deliberate red fixtures block each founder-escape failure boundary', () => {
  /** @type {[string, (states: ReturnType<typeof samples>) => void, string][]} */
  const red = [
    [
      'missing autocomplete',
      states => {
        states[0].fields[0].autocomplete = '';
      },
      'semantics:email:invalid',
    ],
    [
      'wrong autocomplete',
      states => {
        states[0].fields[0].autocomplete = 'current-password';
      },
      'semantics:email:invalid',
    ],
    [
      'fixed CTA behind keyboard',
      states => {
        states[2].actionReachable = false;
      },
      'action-unreachable',
    ],
    [
      'input under browser chrome',
      states => {
        states[2].viewport.top = 150;
      },
      'field-obscured',
    ],
    [
      'unstable vh jump',
      states => {
        states[2].layoutShift = 0.2;
      },
      'layout-jank',
    ],
    [
      'stale autofill state',
      states => {
        states[3].appValue = '';
      },
      'stale-state',
    ],
    [
      'hidden duplicate email',
      states => {
        states[0].fields.push({
          ...states[0].fields[0],
          role: null,
          visible: false,
        });
      },
      'autofill-decoy',
    ],
    [
      'sticky nav toolbar keyboard trap',
      states => {
        states[2].actionReachable = false;
        states[2].safeAreaCorrect = false;
      },
      'action-unreachable',
    ],
    [
      'scroll reset',
      states => {
        states[3].scrollY = 0;
      },
      'scroll-reset',
    ],
    [
      'focus loss',
      states => {
        states[3].focused = false;
      },
      'focus-lost',
    ],
    [
      'remount',
      states => {
        states[3].nodeId = 'input-2';
      },
      'remount',
    ],
    [
      'duplicate submit',
      states => {
        states[5].submitCount = 2;
      },
      'duplicate',
    ],
    [
      'broken dismissal',
      states => {
        states[4].restored = false;
      },
      'not-restored',
    ],
    [
      'broken retry',
      states => {
        states[6].restored = false;
      },
      'not-restored',
    ],
    [
      'oscillation',
      states => {
        states[2].viewportOscillations = 2;
      },
      'oscillation',
    ],
    [
      'overflow',
      states => {
        states[2].horizontalOverflow = 6;
      },
      'layout-jank',
    ],
    [
      'clipped sheet',
      states => {
        states[2].sheetUnclipped = false;
      },
      'chrome-safe-area-or-sheet',
    ],
  ];
  assert.deepEqual(transitionFindings(samples(), ['email', 'tel']), []);
  const hiddenAction = samples();
  hiddenAction[2].action.top = 600;
  hiddenAction[2].action.bottom = 640;
  assert.ok(
    transitionFindings(hiddenAction, ['email', 'tel']).some(f =>
      f.includes('action-unreachable')
    )
  );
  for (const [name, mutate, reason] of red) {
    const states = samples();
    mutate(states);
    assert.ok(
      transitionFindings(states, ['email', 'tel']).some(f =>
        f.includes(reason)
      ),
      name
    );
  }
  assert.ok(
    transitionFindings([], ['email']).includes(
      'transitions:missing-or-unordered'
    )
  );
  const incomplete = samples();
  incomplete[2].visualHeight = null;
  assert.ok(
    transitionFindings(incomplete, ['email']).some(f =>
      f.includes('viewport-unmeasured')
    )
  );
});

test('resting state and synthetic fill cannot pass; every native cell requires exact-build device evidence', () => {
  const missing = browserInputVerdict(undefined, context);
  assert.equal(missing.status, 'UNKNOWN');
  assert.equal(missing.rows.length, inputCells(screenId).length);
  assert.equal(browserInputVerdict(evidence(), context).status, 'BLOCKED');
  const supported = {
    ...INPUT_MATRIX,
    environments: INPUT_MATRIX.environments.filter(
      env => env.support === 'SUPPORTED'
    ),
  };
  assert.equal(
    browserInputVerdict(evidence(), { ...context, matrix: supported }).status,
    'PASS'
  );
  for (const mutate of [
    proof => {
      proof.schema = 'wrong';
    },
    proof => {
      proof.records[0].kind = 'playwright-resize';
    },
    proof => {
      proof.records[0].headSha = 'c'.repeat(40);
    },
    proof => {
      proof.records[0].servedBuildSha = 'd'.repeat(40);
    },
    proof => {
      proof.records[0].recording = null;
    },
    proof => {
      delete proof.records[0].screenshots.focused;
    },
    proof => {
      proof.records[0].samples = [];
    },
    proof => {
      proof.records[0].scenarios.keyboard = 'UNKNOWN';
    },
    proof => {
      proof.records[0].viewportUnits.dvh = 'BLOCKED';
    },
    proof => {
      proof.records.push(proof.records[0]);
    },
    proof => {
      proof.records[0].operator = '';
    },
  ]) {
    const proof = evidence();
    mutate(proof);
    assert.equal(
      browserInputVerdict(proof, { ...context, matrix: supported }).status,
      'BLOCKED'
    );
  }
  assert.equal(
    browserInputVerdict({ ...evidence(), records: [] }, context).status,
    'UNKNOWN'
  );
  assert.deepEqual(
    browserInputFindings(undefined, {
      screenId: 'web.homepage',
      headSha: HEAD,
    }),
    []
  );
});

test('certification and screen-audit both block a green resting profile lacking browser-owned UI proof', () => {
  const screen = {
    id: screenId,
    sources: [],
    viewports: [],
    platform: 'web',
    owner: 'public-profile',
  };
  const findings = evaluateScreenProof(
    { schema: 'screen-browser-proof/v1' },
    { screen, headSha: HEAD }
  );
  assert.ok(
    findings.some(
      f => f.includes('browser-owned-input') && f.includes('UNKNOWN')
    )
  );
  assert.ok(
    findings
      .filter(f => f.startsWith('browser-owned-input'))
      .every(isMissingDeviceEvidence)
  );
  const duplicated = browserInputFindings(
    {
      records: [
        { cellId: 'get-updates/android-chrome/android-current-portrait' },
        { cellId: 'get-updates/android-chrome/android-current-portrait' },
      ],
    },
    { screenId, headSha: HEAD }
  );
  assert.ok(
    duplicated.some(
      f => f.includes(': BLOCKED:') && !isMissingDeviceEvidence(f)
    )
  );
  const ledger = auditScreens({
    registry: [screen],
    headSha: HEAD,
    routeDom: new Map([['/unfazed', [{ viewport: 'mobile', findings: [] }]]]),
  });
  assert.equal(ledger.screens[0].verdict, 'red');
  assert.ok(
    ledger.screens[0].findings.some(f => f.includes('browser-owned-input'))
  );
});

const ARTIST_PAY_SOURCES = [
  'apps/web/app/[username]/pay/page.tsx',
  'apps/web/components/features/profile/views/PayView.tsx',
  'apps/web/components/features/profile/views/ProfileIntentPage.tsx',
  'apps/web/components/organisms/PaySection.tsx',
];
const BROWSER_EMAIL_FIELD =
  /(?:type|autoComplete|autocomplete|inputMode|inputmode)\s*=\s*['"]email['"]/;

test('artist pay owes browser-owned email evidence only when its surface hosts that field', () => {
  const hosted = ARTIST_PAY_SOURCES.some(path =>
    BROWSER_EMAIL_FIELD.test(readFileSync(path, 'utf8'))
  );
  const bound = INPUT_MATRIX.journeys.some(
    journey =>
      journey.fields.includes('email') &&
      journey.screens.includes('web.artist-pay')
  );
  assert.equal(bound, hosted);
  if (hosted) return;
  assert.deepEqual(inputCells('web.artist-pay'), []);
  assert.deepEqual(
    browserInputFindings(undefined, {
      screenId: 'web.artist-pay',
      headSha: HEAD,
    }),
    []
  );
  const pay = auditScreens({
    registry: [
      {
        id: 'web.artist-pay',
        platform: 'web',
        owner: 'artist-pay',
        sources: ['apps/web/app/[username]/pay/page.tsx'],
        viewports: ['desktop', 'mobile'],
      },
    ],
    headSha: HEAD,
  });
  assert.equal(pay.screens[0].producer, 'none');
  assert.equal(pay.screens[0].verdict, 'uncovered');
  assert.deepEqual(pay.screens[0].findings, []);
  assert.equal(
    remediationPlans(pay).some(
      plan => plan.fingerprint === 'screen-audit:web.artist-pay'
    ),
    false
  );
});
