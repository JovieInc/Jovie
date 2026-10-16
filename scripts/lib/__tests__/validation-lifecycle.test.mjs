import { describe, expect, it } from 'vitest';
import {
  COMPUTED_RECEIPT_KINDS,
  currentReceiptsByKind,
  decideValidationTransition,
  declaredRequirements,
  deriveValidationManifest,
  formatLifecycleComment,
  formatValidationReceipt,
  latestLifecycleStatusKey,
  lifecycleStatusKey,
  outcomeAcceptanceReasons,
  parseValidationReceipts,
  RECORDED_RECEIPT_KINDS,
  selectBindingPull,
} from '../validation-lifecycle.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const LOW_RISK = {
  riskLevel: 'low',
  blocksUnattendedAutoMerge: false,
  matchedRules: [],
};

function pull(number, mergeSha, mergedAt) {
  return {
    number,
    url: `https://github.com/JovieInc/Jovie/pull/${number}`,
    mergeSha,
    mergedAt,
  };
}

function manifestFor(issue, extra = {}) {
  const manifest = deriveValidationManifest({
    issue: { identifier: 'JOV-1', labels: [], description: '', ...issue },
    mergedPulls: [pull(10, SHA_A, '2026-10-03T10:00:00Z')],
    risk: LOW_RISK,
    ...extra,
  });
  if (!manifest) throw new Error('expected a manifest');
  return manifest;
}

/**
 * @param {Partial<import('../validation-lifecycle.mjs').ResolvedReceipt>} overrides
 * @returns {import('../validation-lifecycle.mjs').ResolvedReceipt}
 */
function receipt(overrides) {
  return {
    kind: 'outcome',
    status: 'pass',
    sha: SHA_B,
    evidence: 'https://example.test/proof',
    recordedAt: '2026-10-03T12:00:00Z',
    containsBinding: true,
    verifiedArtifact: true,
    ...overrides,
  };
}

const STARTED = { name: 'In Review', type: 'started' };
/** @type {import('../validation-lifecycle.mjs').DeploymentFact} */
const VERIFIED = { status: 'verified', sha: SHA_B };

describe('validation manifest', () => {
  it('binds the newest merge so replayed and out-of-order events agree', () => {
    const older = pull(10, SHA_A, '2026-10-03T10:00:00Z');
    const newer = pull(11, SHA_B, '2026-10-03T11:00:00Z');
    expect(selectBindingPull([older, newer])?.number).toBe(11);
    expect(selectBindingPull([newer, older])?.number).toBe(11);
    expect(selectBindingPull([{ ...older, mergeSha: 'short' }])).toBeNull();
    expect(
      deriveValidationManifest({
        issue: { identifier: 'JOV-1' },
        mergedPulls: [],
        risk: LOW_RISK,
      })
    ).toBeNull();
  });

  it('requires only deployment for an ordinary implementation issue', () => {
    const manifest = manifestFor({ title: 'Profiles: editorial card' });
    expect(manifest.required.map(entry => entry.kind)).toEqual(['deployment']);
    expect(manifest.schema).toBe('jovie.validation-manifest/v1');
    expect(manifest.bindingSha).toBe(SHA_A);
  });

  it('honors an explicit machine audit without inferred UI rows', () => {
    const manifest = manifestFor({
      description: 'validation-required: screen-audit',
    });
    expect(manifest.required.map(entry => entry.kind)).toEqual([
      'deployment',
      'screen-audit',
    ]);
    expect(
      decideValidationTransition({
        state: STARTED,
        manifest,
        holds: [],
        deployment: VERIFIED,
        receipts: [],
      }).target
    ).toBe('Validating');
    expect(
      decideValidationTransition({
        state: STARTED,
        manifest,
        holds: [],
        deployment: VERIFIED,
        receipts: [receipt({ kind: 'screen-audit' })],
      }).target
    ).toBe('Done');
  });

  it.each([
    [
      'commissioning parent',
      { parentReason: 'JOV-1 is a commissioning issue' },
      {},
    ],
    ['reopened after Done', {}, { reopenedAfterDone: true }],
    [
      'unchecked acceptance',
      {},
      { description: '## Acceptance\n- [ ] Live outcome proven' },
    ],
    [
      'commissioning heading',
      {},
      { description: '## First commissioning proof\nRun it.' },
    ],
    ['runtime label', {}, { labels: ['golden-path'] }],
    ['runtime fingerprint', {}, { description: 'Signal fingerprint `ci:abc`' }],
    [
      'acceptance names a check',
      {},
      { description: 'Done when the golden path nightly passes' },
    ],
    ['declared', {}, { description: 'validation-required: outcome' }],
  ])('requires an outcome receipt for %s', (_name, extra, issue) => {
    const manifest = manifestFor(issue, extra);
    expect(manifest.required.map(entry => entry.kind)).toContain('outcome');
  });

  it('needs an outcome for an open acceptance or completion section (JOV-7510 false Done)', () => {
    for (const description of [
      '## Acceptance evidence\n\n1. An exact source/build inventory distinguishes available behavior.',
      '## Evaluation / completion\n\n1. At least one real authorized request reaches Tim.',
      '## Acceptance checks\n* Verify focus and keyboard activation at 390px.',
      '**Acceptance:** one real UI issue goes from agent-ready to Done through lanes alone.',
      '**Done when**\n\n- the nightly run is green',
      '## Acceptance\n- [x] Copy updated\n- [ ] Live on jov.ie',
    ]) {
      expect(outcomeAcceptanceReasons({ description })).toContain(
        'acceptance section names evidence a deploy cannot prove'
      );
    }
    for (const description of [
      '## Acceptance\n- [x] Done\n- [X] Shipped\n\n## Notes\nfree text',
      '## Completion evidence\n\n## Next\nlater',
      '**Acceptance**\n- [x] Shipped\n**Notes**\nfree text after a bold heading',
      '## Goal\nShip the card.\n## Scope\nOne component.',
      'Mentions acceptance testing in prose only.',
    ]) {
      expect(outcomeAcceptanceReasons({ description })).toEqual([]);
    }
  });

  it('keeps checked acceptance and plain bodies closeable', () => {
    expect(
      outcomeAcceptanceReasons({ description: '## Acceptance\n- [x] Done' })
    ).toEqual([]);
    expect(outcomeAcceptanceReasons({ description: '' })).toEqual([]);
  });

  it('adds the JOV-7201 dual closure for escaped defects', () => {
    const manifest = manifestFor({}, { escapedDefect: true });
    expect(manifest.required.map(entry => entry.kind)).toContain(
      'escaped-defect-dual-closure'
    );
  });

  it('turns unknown or unattended-blocking risk into human certification', () => {
    expect(
      manifestFor({}, { risk: null }).required.map(entry => entry.kind)
    ).toContain('human-certification');
    expect(manifestFor({}, { risk: null }).riskLevel).toBe('unknown');
    const blocking = manifestFor(
      {},
      {
        risk: {
          riskLevel: 'high',
          blocksUnattendedAutoMerge: true,
          matchedRules: ['billing-money'],
        },
      }
    );
    expect(blocking.required.at(-1)?.reason).toContain('billing-money');
    const declared = manifestFor({
      description: 'validation-required: human-certification, outcome',
    });
    expect(declared.required.map(entry => entry.kind)).toEqual([
      'deployment',
      'outcome',
      'human-certification',
    ]);
    expect(declaredRequirements('validation-required: deployment')).toEqual([]);
  });

  it('keys UI receipts on the row judgment: machines for correctness, the founder for taste (JOV-7759)', () => {
    const deterministic = {
      row: 'AM-020',
      failureClass: 'ui-state-completeness',
      judgment: 'deterministic',
      targets: ['web-desktop', 'web-mobile'],
    };
    const mixed = {
      row: 'AM-018',
      failureClass: 'ui-motion',
      judgment: 'mixed',
      targets: ['macos-electron'],
    };
    const taste = {
      row: 'AM-024',
      failureClass: 'ui-visual-taste',
      judgment: 'taste',
      targets: ['web-desktop'],
    };
    const kinds = rows =>
      manifestFor({}, { uiEvidence: rows }).required.map(entry => entry.kind);
    expect(kinds([deterministic])).toEqual(['deployment', 'screen-audit']);
    expect(kinds([taste])).toEqual(['deployment', 'founder-taste']);
    expect(kinds([deterministic, mixed])).toEqual([
      'deployment',
      'screen-audit',
      'founder-taste',
    ]);
    const uiEvidence = [deterministic, mixed, taste];
    const ui = manifestFor({}, { uiEvidence });
    expect(ui.required[1].reason).toContain(
      'AM-020 ui-state-completeness, AM-018 ui-motion on web-desktop, web-mobile, macos-electron'
    );
    expect(ui.required[2].reason).toContain(
      'AM-018 ui-motion, AM-024 ui-visual-taste on macos-electron, web-desktop'
    );
    expect(ui.uiEvidence).toEqual(uiEvidence);
    expect(manifestFor({}, { uiEvidence: [] })).not.toHaveProperty(
      'uiEvidence'
    );
    expect(manifestFor({}).required.map(entry => entry.kind)).toEqual([
      'deployment',
    ]);
    const unknown = manifestFor({}, { uiEvidence: null }).required.at(-1);
    expect(unknown?.kind).toBe('screen-audit');
    expect(unknown?.reason).toContain('UI evidence is unknown');
    const declared = manifestFor(
      { description: 'validation-required: founder-taste' },
      { uiEvidence }
    );
    expect(
      declared.required.filter(entry => entry.kind === 'founder-taste')
    ).toHaveLength(1);
    expect(
      manifestFor({
        description: 'validation-required: founder-taste',
      }).required.at(-1)?.reason
    ).toBe('the issue declares validation-required: founder-taste');
  });
});

describe('validation receipts', () => {
  it.each(['outcome', 'screen-audit', 'human-certification', 'founder-taste'])(
    'requires %s proof from the current episode',
    kind => {
      const manifest = manifestFor({
        reopenedAfterDone: true,
        receiptNotBefore: '2026-10-03T13:00:00Z',
        description: `validation-required: ${kind}`,
      });
      const old = receipt({ kind });
      const fresh = receipt({ kind, recordedAt: '2026-10-03T14:00:00Z' });
      const base = {
        state: STARTED,
        manifest,
        holds: [],
        deployment: VERIFIED,
      };
      const currentOutcome = receipt({
        kind: 'outcome',
        recordedAt: '2026-10-03T14:00:00Z',
      });
      expect(
        decideValidationTransition({
          ...base,
          receipts: [old, ...(kind === 'outcome' ? [] : [currentOutcome])],
        }).target
      ).toBe('Validating');
      expect(
        decideValidationTransition({
          ...base,
          receipts: [fresh, currentOutcome],
        }).target
      ).toBe('Done');
      expect(
        decideValidationTransition({
          ...base,
          receipts: [
            receipt({ ...old, status: 'fail' }),
            fresh,
            currentOutcome,
          ],
        }).target
      ).toBe('Done');
    }
  );
  const body = formatValidationReceipt({
    issue: 'jov-1',
    kind: 'outcome',
    status: 'pass',
    sha: SHA_B.toUpperCase(),
    evidence: ' https://example.test/run/1 ',
  });

  it('round-trips a recorded receipt with the server timestamp', () => {
    const parsed = parseValidationReceipts(
      [{ body, createdAt: '2026-10-03T12:00:00.000Z' }],
      'JOV-1'
    );
    expect(parsed).toEqual([
      {
        kind: 'outcome',
        status: 'pass',
        sha: SHA_B,
        evidence: 'https://example.test/run/1',
        recordedAt: '2026-10-03T12:00:00.000Z',
      },
    ]);
  });

  it.each([null, '2026-10-03T08:00:00-04:00'])(
    'round-trips an explicit episode binding %s without changing legacy receipts',
    episodeStartedAt => {
      const bound = formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'outcome',
        status: 'fail',
        sha: SHA_B,
        evidence: 'https://example.test/event/1',
        episodeStartedAt,
      });
      expect(
        parseValidationReceipts(
          [{ body: bound, createdAt: '2026-10-03T13:00:00Z' }],
          'JOV-1'
        )[0].episodeStartedAt
      ).toBe(episodeStartedAt === null ? null : '2026-10-03T12:00:00.000Z');
      expect(
        parseValidationReceipts(
          [{ body, createdAt: '2026-10-03T13:00:00Z' }],
          'JOV-1'
        )[0]
      ).not.toHaveProperty('episodeStartedAt');
    }
  );

  it.each(['bad', '', 123, {}, '2026-10-03'])(
    'invalidates malformed explicit episode binding %j',
    episodeStartedAt => {
      const malformed = body.replace(
        '"kind":"outcome"',
        `"kind":"outcome","episodeStartedAt":${JSON.stringify(episodeStartedAt)}`
      );
      expect(
        parseValidationReceipts(
          [{ body: malformed, createdAt: '2026-10-03T13:00:00Z' }],
          'JOV-1'
        )
      ).toMatchObject([{ kind: 'outcome', status: 'invalid' }]);
      expect(() =>
        formatValidationReceipt({
          issue: 'JOV-1',
          kind: 'outcome',
          status: 'pass',
          sha: SHA_B,
          evidence: 'https://example.test/event/1',
          episodeStartedAt: /** @type {any} */ (episodeStartedAt),
        })
      ).toThrow(/episode/);
    }
  );

  it.each(['pass', 'fail'])(
    'rejects an old-episode %s written after a racing server reopen',
    status => {
      const reopenedAt = '2026-10-03T12:00:00Z';
      const manifest = manifestFor({
        reopenedAfterDone: true,
        receiptNotBefore: reopenedAt,
      });
      const decision = decideValidationTransition({
        state: { name: 'Validating', type: 'started' },
        manifest,
        holds: [],
        deployment: VERIFIED,
        receipts: [
          receipt({
            status: /** @type {'pass' | 'fail'} */ (status),
            episodeStartedAt: null,
            recordedAt: '2026-10-03T12:00:01Z',
          }),
        ],
      });
      expect(decision.target).toBe('Validating');
      expect(decision.missing).toContain('outcome');
    }
  );

  it.each([
    [null, 'sha'],
    ['2026-10-02T08:00:00-04:00', 'sha'],
    [null, 'evidence'],
    [null, 'schema'],
    [null, 'kind'],
  ])(
    'keeps an old episode binding %s when invalidating malformed %s',
    (episodeStartedAt, malformedField) => {
      const reopenedAt = '2026-10-03T12:00:00Z';
      const current = formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'outcome',
        status: 'pass',
        sha: SHA_B,
        evidence: 'https://example.test/current/run',
        episodeStartedAt: reopenedAt,
      });
      const malformed = formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'outcome',
        status: 'pass',
        sha: SHA_B,
        evidence: 'https://example.test/old/run',
        episodeStartedAt,
      }).replace(
        new RegExp(`"${malformedField}":"[^"]*"`),
        `"${malformedField}":""`
      );
      const parsed = parseValidationReceipts(
        [
          { body: current, createdAt: '2026-10-03T13:00:00Z' },
          { body: malformed, createdAt: '2026-10-03T14:00:00Z' },
        ],
        'JOV-1'
      );
      expect(parsed[1]).toMatchObject({
        status: 'invalid',
        episodeStartedAt:
          episodeStartedAt === null ? null : '2026-10-02T12:00:00.000Z',
      });
      const receipts = parsed.map(value =>
        receipt({ ...value, verifiedArtifact: value.status !== 'invalid' })
      );
      expect(
        currentReceiptsByKind(receipts, reopenedAt).get('outcome')?.status
      ).toBe('pass');
      expect(
        decideValidationTransition({
          state: { name: 'Validating', type: 'started' },
          manifest: manifestFor({
            reopenedAfterDone: true,
            receiptNotBefore: reopenedAt,
          }),
          holds: [],
          deployment: VERIFIED,
          receipts,
        }).target
      ).toBe('Done');
    }
  );

  it.each(['2026-10-03T08:00:00-04:00', 'unreadable'])(
    'holds current proof when a malformed receipt has episode binding %s',
    episodeStartedAt => {
      const reopenedAt = '2026-10-03T12:00:00Z';
      const current = formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'outcome',
        status: 'pass',
        sha: SHA_B,
        evidence: 'https://example.test/current/run',
        episodeStartedAt: reopenedAt,
      });
      const malformed = current
        .replace(`"sha":"${SHA_B}"`, '"sha":"bad"')
        .replace(
          '"episodeStartedAt":"2026-10-03T12:00:00.000Z"',
          `"episodeStartedAt":"${episodeStartedAt}"`
        );
      const parsed = parseValidationReceipts(
        [
          { body: current, createdAt: '2026-10-03T13:00:00Z' },
          { body: malformed, createdAt: '2026-10-03T14:00:00Z' },
        ],
        'JOV-1'
      );
      expect(parsed[1].status).toBe('invalid');
      if (episodeStartedAt === 'unreadable')
        expect(parsed[1]).not.toHaveProperty('episodeStartedAt');
      else expect(parsed[1].episodeStartedAt).toBe('2026-10-03T12:00:00.000Z');
      const receipts = parsed.map(value =>
        receipt({ ...value, verifiedArtifact: value.status !== 'invalid' })
      );
      expect(
        currentReceiptsByKind(receipts, reopenedAt).get('outcome')?.status
      ).toBe('invalid');
      const decision = decideValidationTransition({
        state: { name: 'Validating', type: 'started' },
        manifest: manifestFor({
          reopenedAfterDone: true,
          receiptNotBefore: reopenedAt,
        }),
        holds: [],
        deployment: VERIFIED,
        receipts,
      });
      expect(decision.target).toBe('Validating');
      expect(decision.missing).toContain('outcome');
    }
  );

  it('matches semantic current episode times, initial null and unbound legacy producers', () => {
    const reopenedAt = '2026-10-03T12:00:00Z';
    const bound = receipt({
      episodeStartedAt: '2026-10-03T08:00:00-04:00',
      recordedAt: '2026-10-03T12:00:01Z',
    });
    expect(currentReceiptsByKind([bound], reopenedAt).get('outcome')).toBe(
      bound
    );
    expect(currentReceiptsByKind([bound]).has('outcome')).toBe(false);
    expect(currentReceiptsByKind([bound], null).size).toBe(0);
    expect(
      currentReceiptsByKind(
        [
          receipt({
            episodeStartedAt: '2026-10-02T12:00:00Z',
            recordedAt: '2026-10-03T12:00:01Z',
          }),
        ],
        reopenedAt
      ).size
    ).toBe(0);
    expect(
      currentReceiptsByKind([receipt({ episodeStartedAt: null })]).has(
        'outcome'
      )
    ).toBe(true);
    expect(
      currentReceiptsByKind(
        [receipt({ recordedAt: '2026-10-03T12:00:01Z' })],
        reopenedAt
      ).has('outcome')
    ).toBe(true);
  });

  it('carries a founder note on a rejection and bounds it', () => {
    const rejection = formatValidationReceipt({
      issue: 'JOV-1',
      kind: 'founder-taste',
      status: 'fail',
      sha: SHA_B,
      evidence: 'https://example.test/ovie/taste/7',
      note: ' Too much chrome around the player. ',
    });
    expect(rejection).toContain('Note: Too much chrome around the player.');
    expect(
      parseValidationReceipts(
        [{ body: rejection, createdAt: '2026-10-03T12:00:00Z' }],
        'JOV-1'
      )[0]
    ).toMatchObject({
      kind: 'founder-taste',
      status: 'fail',
      note: 'Too much chrome around the player.',
    });
    expect(() =>
      formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'founder-taste',
        status: 'fail',
        sha: SHA_B,
        evidence: 'https://example.test/ovie/taste/7',
        note: 'x'.repeat(2001),
      })
    ).toThrow(/at most 2000/);
    const decision = decideValidationTransition({
      state: { name: 'Validating', type: 'started' },
      manifest: manifestFor(
        {},
        {
          uiEvidence: [
            {
              row: 'AM-024',
              failureClass: 'x',
              judgment: 'taste',
              targets: [],
            },
          ],
        }
      ),
      holds: [],
      deployment: { status: 'verified', sha: SHA_B },
      receipts: [
        receipt({
          kind: 'founder-taste',
          status: 'fail',
          note: 'Too much chrome around the player.',
        }),
      ],
    });
    expect(decision.target).toBe('Rework');
    expect(decision.explanation[0]).toContain(
      '. Note: Too much chrome around the player.'
    );
  });

  it('ignores other issues and computed kinds but retains malformed evidence as unknown', () => {
    const forged = body.replace('"kind":"outcome"', '"kind":"deployment"');
    const other = body.replace('JOV-1', 'JOV-2');
    expect(COMPUTED_RECEIPT_KINDS).toContain('deployment');
    const parsed = parseValidationReceipts(
      [
        { body: forged, createdAt: '2026-10-03T12:00:00Z' },
        { body: other, createdAt: '2026-10-03T12:00:00Z' },
        { body, createdAt: 'not a time' },
        {
          body: '<!-- validation-receipt:v1\n{not json}\n-->',
          createdAt: '2026-10-03T12:00:00Z',
        },
        {
          body: '<!-- validation-receipt:v1\n"text"\n-->',
          createdAt: '2026-10-03T12:00:00Z',
        },
      ],
      'JOV-1'
    );
    expect(parsed).toHaveLength(8);
    expect(parsed.every(receipt => receipt.status === 'invalid')).toBe(true);
    expect(parsed.map(receipt => receipt.kind)).toEqual([
      ...RECORDED_RECEIPT_KINDS,
      ...RECORDED_RECEIPT_KINDS,
    ]);
  });

  it.each([
    [{ issue: 'LYB-1' }, /JOV identifier/],
    [{ kind: 'deployment' }, /kind must be/],
    [{ status: 'maybe' }, /pass or fail/],
    [{ sha: 'abc' }, /full commit/],
    [{ evidence: 'x' }, /reference the proof/],
  ])('rejects an invalid receipt %j', (override, error) => {
    expect(() =>
      formatValidationReceipt({
        issue: 'JOV-1',
        kind: 'outcome',
        status: 'pass',
        sha: SHA_B,
        evidence: 'https://example.test/run/1',
        .../** @type {any} */ (override),
      })
    ).toThrow(error);
  });

  it('takes the latest current receipt per kind and drops stale generations', () => {
    const latest = currentReceiptsByKind([
      receipt({ status: 'fail', recordedAt: '2026-10-03T11:00:00Z' }),
      receipt({ status: 'pass', recordedAt: '2026-10-03T12:00:00Z' }),
      receipt({
        kind: 'human-certification',
        status: 'fail',
        containsBinding: false,
      }),
    ]);
    expect(latest.get('outcome')?.status).toBe('pass');
    expect(latest.has('human-certification')).toBe(false);
  });
});

describe('validation transition', () => {
  it('never touches Done or Canceled work', () => {
    for (const type of ['completed', 'canceled']) {
      expect(
        decideValidationTransition({
          state: { name: 'Done', type },
          manifest: manifestFor({}),
          holds: [],
          deployment: { status: 'pending' },
          receipts: [],
        }).target
      ).toBeNull();
    }
  });

  it('holds without moving while linked work is open', () => {
    const decision = decideValidationTransition({
      state: STARTED,
      manifest: manifestFor({}),
      holds: ['Linked pull requests still open or draft: #2.'],
      deployment: VERIFIED,
      receipts: [],
    });
    expect(decision.target).toBeNull();
    expect(decision.explanation[0]).toContain('#2');
  });

  it('waits in Merging until a verified generation contains the merge', () => {
    const decision = decideValidationTransition({
      state: STARTED,
      manifest: manifestFor({}),
      holds: [],
      deployment: { status: 'pending', detail: 'not yet promoted' },
      receipts: [],
    });
    expect(decision.target).toBe('Merging');
    expect(decision.missing).toEqual(['deployment']);
    expect(decision.explanation[0]).toContain('not yet promoted');
  });

  it('treats unknown deployment as RED and leaves the state alone', () => {
    const decision = decideValidationTransition({
      state: { name: 'Validating', type: 'started' },
      manifest: manifestFor({}),
      holds: [],
      deployment: { status: 'unknown', detail: 'version HTTP 503' },
      receipts: [],
    });
    expect(decision.target).toBeNull();
    expect(decision.explanation[0]).toContain('version HTTP 503');
  });

  it('marks an ordinary issue Done once deployed', () => {
    const decision = decideValidationTransition({
      state: { name: 'Merging', type: 'started' },
      manifest: manifestFor({}),
      holds: [],
      deployment: VERIFIED,
      receipts: [],
    });
    expect(decision.target).toBe('Done');
  });

  it('keeps outcome acceptance in Validating until a verified pass receipt', () => {
    const manifest = manifestFor({}, { parentReason: 'commissioning' });
    const base = {
      state: { name: 'Merging', type: 'started' },
      manifest,
      holds: [],
      deployment: VERIFIED,
    };
    const missing = decideValidationTransition({ ...base, receipts: [] });
    expect(missing.target).toBe('Validating');
    expect(missing.missing).toEqual(['outcome']);
    const unverified = decideValidationTransition({
      ...base,
      receipts: [receipt({ verifiedArtifact: false })],
    });
    expect(unverified.target).toBe('Validating');
    expect(unverified.explanation[0]).toContain('not a verified production');
    expect(
      decideValidationTransition({ ...base, receipts: [receipt({})] }).target
    ).toBe('Done');
  });

  it('routes a required failure to Rework, even before deployment', () => {
    const decision = decideValidationTransition({
      state: { name: 'Validating', type: 'started' },
      manifest: manifestFor({}, { parentReason: 'commissioning' }),
      holds: [],
      deployment: { status: 'pending' },
      receipts: [receipt({ status: 'fail', verifiedArtifact: false })],
    });
    expect(decision.target).toBe('Rework');
    expect(decision.failing).toHaveLength(1);
    expect(decision.explanation[0]).toContain('Required outcome failed');
  });

  it('ignores a failure for a kind the manifest does not require', () => {
    const decision = decideValidationTransition({
      state: { name: 'Validating', type: 'started' },
      manifest: manifestFor({}),
      holds: [],
      deployment: VERIFIED,
      receipts: [receipt({ kind: 'human-certification', status: 'fail' })],
    });
    expect(decision.target).toBe('Done');
  });

  it('requires the escaped-defect dual closure beyond deployment', () => {
    const base = {
      state: { name: 'Merging', type: 'started' },
      manifest: manifestFor({}, { escapedDefect: true }),
      holds: [],
      deployment: VERIFIED,
      receipts: [],
    };
    const open = decideValidationTransition(base);
    expect(open.target).toBe('Validating');
    expect(open.explanation[0]).toContain('closure evidence unavailable');
    const failing = decideValidationTransition({
      ...base,
      escapedDefect: {
        ok: false,
        errors: ['detection.detectorRef is required'],
      },
    });
    expect(failing.explanation[0]).toContain('detectorRef');
    expect(
      decideValidationTransition({
        ...base,
        escapedDefect: { ok: true, errors: [] },
      }).target
    ).toBe('Done');
  });
});

describe('lifecycle status comment', () => {
  it('dedupes on a stable key and carries the manifest', () => {
    const manifest = manifestFor({}, { parentReason: 'commissioning' });
    const key = lifecycleStatusKey({
      target: 'Validating',
      manifest,
      missing: ['outcome'],
      failing: [],
    });
    expect(
      lifecycleStatusKey({
        target: 'Validating',
        manifest,
        missing: ['outcome'],
        failing: [],
        deploymentSha: SHA_C,
      })
    ).toBe(key);
    expect(
      lifecycleStatusKey({
        target: 'Done',
        manifest,
        missing: [],
        failing: [],
        deploymentSha: SHA_C,
      })
    ).not.toBe(key);
    const body = formatLifecycleComment({
      identifier: 'JOV-1',
      from: 'Merging',
      target: 'Validating',
      manifest,
      missing: ['outcome'],
      explanation: ['outcome: no current receipt'],
      statusKey: key,
      deploymentSha: SHA_C,
    });
    expect(body).toContain('moved JOV-1 from Merging to Validating');
    expect(body).toContain('Next missing receipt: outcome.');
    expect(body).toContain(`Verified production generation: ${SHA_C}`);
    expect(body).toContain('"schema":"jovie.validation-manifest/v1"');
    expect(latestLifecycleStatusKey([{ body: 'other' }, { body }])).toBe(key);
    expect(
      formatLifecycleComment({
        identifier: 'JOV-1',
        from: 'Validating',
        target: 'Validating',
        manifest,
        missing: [],
        explanation: [],
        statusKey: key,
      })
    ).toContain('kept JOV-1 in Validating');
  });
});
