import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { deriveCodeRegisteredIdentities } from './pen-code-registry.mjs';
import {
  auditPenRegistryLedger,
  computeEntitledStatus,
  PEN_REGISTRY_LEDGER_SCHEMA,
  renderLedgerLines,
  validateLedgerExport,
} from './pen-registry-ledger-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-registry-audit.mjs');
const CURRENT_SHA = 'd16b6ac0000000000000000000000000000000';

function safeReceipts(sha = CURRENT_SHA) {
  return [
    { kind: 'source', sha, observedAt: '2026-08-10T00:00:00.000Z' },
    { kind: 'runtime-desktop', sha, observedAt: '2026-08-10T00:01:00.000Z' },
    { kind: 'runtime-narrow', sha, observedAt: '2026-08-10T00:02:00.000Z' },
    { kind: 'same-node-readback', sha, observedAt: '2026-08-10T00:03:00.000Z' },
    {
      kind: 'containing-production',
      sha,
      observedAt: '2026-08-10T00:04:00.000Z',
    },
  ];
}

function record(overrides = {}) {
  return {
    registryId: 'section.faq',
    rootNodeId: 'pAAhw',
    metadataStatus: 'SAFE',
    visibleStatus: 'SAFE',
    sourceBacked: true,
    receipts: safeReceipts(),
    blocker: null,
    owner: 'veronica',
    issueId: 'JOV-4969',
    ...overrides,
  };
}

function ledger(overrides = {}) {
  const records = overrides.records ?? [
    record(),
    record({
      registryId: 'section.hero',
      rootNodeId: 'SijpA',
      metadataStatus: 'BLOCKED',
      visibleStatus: 'BLOCKED',
      receipts: [],
      blocker: 'no exact source receipt',
      owner: 'eve',
      issueId: 'JOV-4961',
    }),
  ];
  return {
    schema: PEN_REGISTRY_LEDGER_SCHEMA,
    exportedAt: '2026-08-11T00:00:00.000Z',
    sourceFile: 'Jovie Design Studio — canonical.pen',
    sourceFileSha256: 'abc123',
    currentSourceSha: CURRENT_SHA,
    registeredIdentities: ['section.faq', 'section.hero'],
    ...overrides,
    records,
  };
}

function failureCodes(receipt) {
  return receipt.failures.map(entry => entry.code);
}

test('a singular, fully receipted ledger passes with a truthful denominator', () => {
  const receipt = auditPenRegistryLedger(ledger());
  assert.equal(receipt.verdict, 'pass');
  assert.deepEqual(receipt.denominator, {
    SAFE: 1,
    PARTIAL: 0,
    BLOCKED: 1,
    total: 2,
    proposals: 0,
  });
  assert.equal(receipt.registeredIdentities, 2);
});

test('visible status differing from metadata status fails', () => {
  const receipt = auditPenRegistryLedger(
    ledger({ records: [record({ visibleStatus: 'PARTIAL' }), ledgerRecord2()] })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('visible-status-mismatch'));
});

function ledgerRecord2() {
  return record({
    registryId: 'section.hero',
    rootNodeId: 'SijpA',
    metadataStatus: 'BLOCKED',
    visibleStatus: 'BLOCKED',
    receipts: [],
    blocker: 'no exact source receipt',
  });
}

test('more than one authoritative record per identity fails', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [record(), record({ rootNodeId: 'Pu59r' })],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('duplicate-authoritative-record'));
});

test('the same root node bound to two identities fails', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [record(), record({ registryId: 'section.faq-alias' })],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('duplicate-root-node'));
});

test('source identity stays current via an explicit currentThrough compare proof', () => {
  const NEXT_SHA = 'bb1a902888b2a7ca4dab7082bb67963c03bfb529';
  const carriedForward = record({
    receipts: [
      {
        kind: 'source',
        sha: CURRENT_SHA,
        currentThrough: NEXT_SHA,
        observedAt: '2026-08-10T00:00:00.000Z',
      },
      {
        kind: 'runtime-desktop',
        sha: NEXT_SHA,
        observedAt: '2026-08-11T00:01:00.000Z',
      },
      {
        kind: 'runtime-narrow',
        sha: NEXT_SHA,
        observedAt: '2026-08-11T00:02:00.000Z',
      },
      {
        kind: 'same-node-readback',
        sha: NEXT_SHA,
        observedAt: '2026-08-11T00:03:00.000Z',
      },
      {
        kind: 'containing-production',
        sha: NEXT_SHA,
        observedAt: '2026-08-11T00:04:00.000Z',
      },
    ],
  });
  const export_ = ledger({ records: [carriedForward, ledgerRecord2()] });
  export_.currentSourceSha = NEXT_SHA;
  const receipt = auditPenRegistryLedger(export_);
  assert.equal(receipt.verdict, 'pass');
  assert.equal(receipt.denominator.SAFE, 1);
});

test('runtime generation receipts are stale at a newer current SHA', () => {
  const NEXT_SHA = 'bb1a902888b2a7ca4dab7082bb67963c03bfb529';
  const staleRuntime = record({
    receipts: [
      {
        kind: 'source',
        sha: CURRENT_SHA,
        currentThrough: NEXT_SHA,
        observedAt: '2026-08-10T00:00:00.000Z',
      },
      ...safeReceipts().filter(r => r.kind !== 'source'),
    ],
  });
  const export_ = ledger({ records: [staleRuntime, ledgerRecord2()] });
  export_.currentSourceSha = NEXT_SHA;
  const receipt = auditPenRegistryLedger(export_);
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('stale-proof-retained'));
  assert.ok(failureCodes(receipt).includes('unsafe-safe'));
  const stale = receipt.failures.find(f => f.code === 'stale-proof-retained');
  assert.match(stale.detail, /generation-bound/);
});

test('currentThrough compare proof on a non-source receipt is malformed', () => {
  const problems = validateLedgerExport(
    ledger({
      records: [
        record({
          receipts: [
            {
              kind: 'runtime-desktop',
              sha: CURRENT_SHA,
              currentThrough: 'bb1a902',
              observedAt: '2026-08-10T00:01:00.000Z',
            },
          ],
        }),
        ledgerRecord2(),
      ],
    })
  );
  assert.ok(
    problems.some(p =>
      p.includes(
        'currentThrough compare proof is only defined for source receipts'
      )
    )
  );
});

test('SAFE without same-node readback and runtime evidence fails', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [
        record({
          receipts: [
            {
              kind: 'source',
              sha: CURRENT_SHA,
              observedAt: '2026-08-10T00:00:00.000Z',
            },
          ],
        }),
        ledgerRecord2(),
      ],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('unsafe-safe'));
  const unsafe = receipt.failures.find(f => f.code === 'unsafe-safe');
  assert.match(unsafe.detail, /runtime-desktop/);
  assert.match(unsafe.detail, /same-node-readback/);
  assert.match(unsafe.detail, /containing-production/);
});

test('stale proof retained without explicit expiry fails', () => {
  const stale = record({
    metadataStatus: 'PARTIAL',
    visibleStatus: 'PARTIAL',
    receipts: [
      {
        kind: 'source',
        sha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
        observedAt: '2026-08-09T00:00:00.000Z',
      },
    ],
  });
  const receipt = auditPenRegistryLedger(
    ledger({ records: [stale, ledgerRecord2()] })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('stale-proof-retained'));
});

test('explicitly expired stale proof is retained history, not a failure', () => {
  const expiredHistory = record({
    receipts: [
      ...safeReceipts(),
      {
        kind: 'source',
        sha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
        observedAt: '2026-08-09T00:00:00.000Z',
        expired: true,
        expiredReason: 'superseded by d16b6ac re-import',
      },
    ],
  });
  const receipt = auditPenRegistryLedger(
    ledger({ records: [expiredHistory, ledgerRecord2()] })
  );
  assert.equal(receipt.verdict, 'pass');
});

test('denominator must equal the number of unique registered identities', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [record()],
      registeredIdentities: ['section.faq', 'section.hero'],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('denominator-mismatch'));
});

test('a status record for an unregistered identity fails', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [
        record(),
        record({ registryId: 'section.imposter', rootNodeId: 'Zzz99' }),
      ],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('unknown-registered-identity'));
});

test('PROPOSAL work is excluded from SAFE counts and the denominator', () => {
  const proposal = record({
    registryId: 'proposal.proof-moment',
    rootNodeId: 'GkKNm',
    metadataStatus: 'PROPOSAL',
    visibleStatus: 'PROPOSAL',
    sourceBacked: false,
    receipts: [],
  });
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [record(), ledgerRecord2(), proposal],
    })
  );
  assert.equal(receipt.verdict, 'pass');
  assert.equal(receipt.denominator.total, 2);
  assert.equal(receipt.denominator.proposals, 1);
  assert.equal(receipt.denominator.SAFE, 1);
});

test('PROPOSAL work may not claim SAFE', () => {
  const proposal = record({
    registryId: 'proposal.proof-moment',
    rootNodeId: 'GkKNm',
    metadataStatus: 'SAFE',
    visibleStatus: 'SAFE',
    sourceBacked: false,
    receipts: safeReceipts(),
  });
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [record(), ledgerRecord2(), proposal],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('unsafe-safe'));
});

test('a PARTIAL claim where SAFE is entitled is not recomputable', () => {
  const receipt = auditPenRegistryLedger(
    ledger({
      records: [
        record({ metadataStatus: 'PARTIAL', visibleStatus: 'PARTIAL' }),
        ledgerRecord2(),
      ],
    })
  );
  assert.equal(receipt.verdict, 'fail');
  assert.ok(failureCodes(receipt).includes('status-not-recomputable'));
});

test('BLOCKED requires a named blocker', () => {
  const problems = validateLedgerExport(
    ledger({
      records: [
        record(),
        record({
          registryId: 'section.hero',
          rootNodeId: 'SijpA',
          metadataStatus: 'BLOCKED',
          visibleStatus: 'BLOCKED',
          receipts: [],
          blocker: null,
        }),
      ],
    })
  );
  assert.ok(
    problems.some(p => p.includes('BLOCKED records must name a blocker'))
  );
});

test('computeEntitledStatus is mechanical', () => {
  assert.equal(computeEntitledStatus(record(), CURRENT_SHA), 'SAFE');
  assert.equal(
    computeEntitledStatus(record({ receipts: [] }), CURRENT_SHA),
    'BLOCKED'
  );
  assert.equal(
    computeEntitledStatus(
      record({ receipts: safeReceipts(), blocker: 'runtime pending' }),
      CURRENT_SHA
    ),
    'BLOCKED'
  );
  assert.equal(
    computeEntitledStatus(
      record({
        receipts: safeReceipts().filter(r => r.kind !== 'runtime-narrow'),
      }),
      CURRENT_SHA
    ),
    'PARTIAL'
  );
  assert.equal(
    computeEntitledStatus(record({ sourceBacked: false }), CURRENT_SHA),
    'PROPOSAL'
  );
});

test('render is deterministic and contains no hand-authored status strings', () => {
  const lines = renderLedgerLines(ledger());
  assert.deepEqual(lines, [
    'SAFE | section.faq | root pAAhw | owner veronica | issue JOV-4969 | blocker none',
    'BLOCKED | section.hero | root SijpA | owner eve | issue JOV-4961 | blocker no exact source receipt',
  ]);
  assert.deepEqual(renderLedgerLines(ledger()), lines);
});

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: join(HERE, '..', '..'),
  });
}

function withLedgerFile(value, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pen-registry-audit-'));
  const path = join(dir, 'ledger.json');
  writeFileSync(path, value);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI passes a valid ledger and renders rows on request', () => {
  withLedgerFile(JSON.stringify(ledger()), path => {
    const audit = runCli([path]);
    assert.equal(audit.status, 0, audit.stdout);
    assert.equal(JSON.parse(audit.stdout).verdict, 'pass');

    const rendered = runCli([path, '--render']);
    assert.equal(rendered.status, 0, rendered.stdout);
    const lines = rendered.stdout.trim().split('\n');
    assert.equal(
      lines[1],
      'SAFE | section.faq | root pAAhw | owner veronica | issue JOV-4969 | blocker none'
    );
  });
});

test('CLI exits 1 on audit failure and does not render', () => {
  withLedgerFile(
    JSON.stringify(
      ledger({
        records: [
          record({ visibleStatus: 'SAFE', metadataStatus: 'PARTIAL' }),
          ledgerRecord2(),
        ],
      })
    ),
    path => {
      const result = runCli([path, '--render']);
      assert.equal(result.status, 1);
      const receipt = JSON.parse(result.stdout);
      assert.equal(receipt.verdict, 'fail');
      assert.ok(failureCodes(receipt).includes('visible-status-mismatch'));
      assert.ok(!result.stdout.includes(' | root '));
    }
  );
});

test('CLI exits 2 on malformed exports and bad invocations', () => {
  withLedgerFile('{"schema":"wrong"}', path => {
    const result = runCli([path]);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).verdict, 'error');
  });
  withLedgerFile('not json', path => {
    assert.equal(runCli([path]).status, 2);
  });
  assert.equal(runCli([]).status, 2);
  assert.equal(runCli(['/definitely/missing.json']).status, 2);
  const help = runCli(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});

test('registry-source-drift: export identities must equal code-derived identities', () => {
  const codeIdentities = ['section.faq', 'section.hero'];
  const matching = auditPenRegistryLedger(ledger(), codeIdentities);
  assert.equal(matching.verdict, 'pass');
  assert.equal(matching.codeRegisteredIdentities, 2);

  const drifted = auditPenRegistryLedger(
    ledger({
      registeredIdentities: [
        'section.faq',
        'section.hero',
        'shell.marketingcontainer.prose',
      ],
    }),
    codeIdentities
  );
  assert.equal(drifted.verdict, 'fail');
  assert.ok(failureCodes(drifted).includes('registry-source-drift'));
  const drift = drifted.failures.find(
    entry => entry.code === 'registry-source-drift'
  );
  assert.match(drift.detail, /shell\.marketingcontainer\.prose/);
});

test('code registry derivation reads the exact current code: 37 identities', () => {
  const derived = deriveCodeRegisteredIdentities({
    cwd: join(HERE, '..', '..'),
  });
  assert.equal(derived.total, 37);
  assert.deepEqual(derived.byKind, { shell: 8, section: 17, recipe: 12 });
  assert.ok(derived.ids.includes('shell.footer-cta'));
  assert.ok(derived.ids.includes('shell.final-cta'));
  for (const stale of [
    'shell.marketingfootercta',
    'shell.marketingfinalcta',
    'shell.marketingcontainer.prose',
  ]) {
    assert.ok(
      !derived.ids.includes(stale),
      `${stale} is a stale Pen-only root, not a code identity`
    );
  }
});

function blockedRecordFor(registryId, index) {
  return record({
    registryId,
    rootNodeId: `root${index}`,
    metadataStatus: 'BLOCKED',
    visibleStatus: 'BLOCKED',
    receipts: [],
    blocker: 'awaiting receipts',
  });
}

test('CLI --code-registry: live export drift fails, converged export passes', () => {
  const cwd = join(HERE, '..', '..');
  const derived = deriveCodeRegisteredIdentities({ cwd });
  const converged = ledger({
    registeredIdentities: derived.ids,
    records: derived.ids.map((id, index) => blockedRecordFor(id, index)),
  });
  withLedgerFile(JSON.stringify(converged), path => {
    const result = runCli([path, '--code-registry']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'pass');
    assert.equal(receipt.registeredIdentities, 37);
    assert.equal(receipt.codeRegisteredIdentities, 37);
    assert.equal(receipt.denominator.total, 37);
    assert.match(result.stderr, /37 registered identities/);
  });

  const drifted = ledger({
    registeredIdentities: [...derived.ids, 'shell.marketingcontainer.prose'],
    records: derived.ids.map((id, index) => blockedRecordFor(id, index)),
  });
  withLedgerFile(JSON.stringify(drifted), path => {
    const result = runCli([path, '--code-registry']);
    assert.equal(result.status, 1);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'fail');
    assert.ok(failureCodes(receipt).includes('registry-source-drift'));
  });
});
