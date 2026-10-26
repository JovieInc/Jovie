import { describe, expect, it } from 'vitest';
import {
  auditMarketingCopyPage,
  auditMarketingCopySemantics,
  createMarketingCopyReviewDigest,
  type MarketingCopyPageBrief,
  type MarketingCopyPageDraft,
} from '@/data/marketing';
import {
  auditMarketingCopyPeerGroups,
  MARKETING_COPY_PEN_PEER_GROUPS,
  type MarketingCopyPeerGroup,
  type MarketingCopyPeerShadowOptions,
} from '@/data/marketing/copy';
import {
  auditRenderedCopySurface,
  certifiedLinesFromDraft,
} from '@/lib/copy/rendered-surface';

const brief: MarketingCopyPageBrief = {
  pageId: 'artist-profiles',
  route: '/artist-profiles',
  audience: 'independent artists',
  objective: 'earn a profile claim',
  claims: [
    {
      id: 'profile',
      statement: 'One profile can be shared everywhere.',
      evidence: ['route'],
    },
  ],
  outcomes: [
    {
      id: 'one-profile',
      statement: 'Share one profile across every fan moment.',
      claimIds: ['profile'],
    },
  ],
  actions: [{ id: 'claim', statement: 'Claim the profile.' }],
  instructionTokens: {
    process: ['concise', 'compress'],
    style: ['premium', 'adaptive'],
    audience: ['artist', 'artists'],
    productCategory: ['profile', 'profiles'],
  },
  sections: [
    {
      sectionId: 'hero',
      storyBeat: 'promise',
      sectionJob: 'name the product outcome',
      customerOutcome: 'the artist gets one durable destination',
      messageSubject: 'profile',
      visualEvidence: 'a live profile',
      allowedClaimIds: ['profile'],
      headlineWordLimit: 8,
      headlineSignals: [['profile']],
    },
  ],
};

function draft(
  headline: string,
  lineBindings = [
    { lineId: 'headline', role: 'headline' as const, outcomeId: 'one-profile' },
  ]
): MarketingCopyPageDraft {
  return {
    pageId: brief.pageId,
    route: brief.route,
    sections: [
      {
        sectionId: 'hero',
        candidateId: 'hero-v1',
        control: { headline: 'The link your music deserves.' },
        headline,
        claimIds: ['profile'],
        lineBindings,
        meaningTrace: 'This line names the customer outcome.',
        tasteTags: ['direct'],
      },
    ],
  };
}

describe('meaning-first marketing copy guard', () => {
  it('passes truthful outcome-bound language, including adaptive and premium', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('One adaptive premium profile for every fan')
    );
    expect(result.status).toBe('pass');
  });

  it.each([
    ['meta-copy', 'One concise heading, built for artists.'],
    ['brief-parroting', 'Concise premium adaptive.'],
    ['style-adjective-substitution', 'A premium adaptive profile.'],
    ['audience-product-category-mismatch', 'Built for dashboards.'],
    ['built-for-wrong-noun', 'Built for dashboards.'],
    ['generic-feature-soup', 'AI, analytics, integrations, and workflows.'],
    ['headline-layout-copy', 'A premium heading for the page.'],
  ] as const)('rejects %s', (code, headline) => {
    const result = auditMarketingCopySemantics(brief, draft(headline), {
      enforcement: 'delta',
    });
    expect(result.status).toBe('fail');
    expect(result.issueCounts[code]).toBeGreaterThan(0);
  });

  it('requires every visible line to name an outcome, claim, or action', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('Share one profile everywhere', []),
      { enforcement: 'delta' }
    );
    expect(result.issueCounts['unbound-visible-line']).toBe(1);
    expect(result.blocking).toBe(true);
  });

  it('reports legacy issues without blocking shadow mode', () => {
    const result = auditMarketingCopySemantics(
      brief,
      draft('Concise premium adaptive.'),
      { enforcement: 'shadow' }
    );
    expect(result.status).toBe('advisory');
    expect(result.blocking).toBe(false);
  });

  it('passes a complete outcome-bound page through the structural audit', () => {
    expect(
      auditMarketingCopyPage(brief, draft('One profile for every fan'))
    ).toEqual([]);
  });

  it('fingerprints the reviewed brief and candidate, so changed copy cannot reuse a receipt', () => {
    const first = createMarketingCopyReviewDigest(
      brief,
      draft('One profile for every fan')
    );
    const second = createMarketingCopyReviewDigest(
      brief,
      draft('One profile for every release')
    );
    expect(first).toMatch(/^marketing-copy\/1\.1\.0\/sha256\/[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it.each([
    ['corporate-verb', 'Seamlessly unlock a world-class profile ecosystem.'],
    ['formulaic-contrast', 'More than just a profile.'],
    ['model-residue', 'Here is a revised option A: your profile.'],
    ['em-dash', 'One profile — every fan.'],
  ] as const)('flags %s in the anti-slop audit', (code, headline) => {
    const issues = auditMarketingCopyPage(brief, draft(headline));
    expect(issues.some(issue => issue.code === code)).toBe(true);
  });

  it('does not let a registry pass certify a route that renders different words', () => {
    const passingDraft = draft('One profile for every fan');
    expect(
      auditMarketingCopySemantics(brief, passingDraft, { enforcement: 'delta' })
        .status
    ).toBe('pass');
    const issues = auditRenderedCopySurface(
      {
        route: brief.route,
        stateId: 'default',
        sourceVersion: 'test-source',
        lines: [
          {
            lineId: 'hero/headline',
            role: 'headline',
            value: 'Grow your fanbase overnight.',
          },
        ],
      },
      {
        route: brief.route,
        stateId: 'default',
        sourceVersion: 'test-source',
        register: 'jovie-marketing',
        lines: certifiedLinesFromDraft(passingDraft),
      }
    );
    expect(issues.some(entry => entry.code === 'changed-rendered-text')).toBe(
      true
    );
  });

  it('flags compression failures without banning truthful premium language', () => {
    const briefWithBody: MarketingCopyPageBrief = {
      ...brief,
      sections: [{ ...brief.sections[0], bodyWordLimit: 30 }],
    };
    const issues = auditMarketingCopyPage(brief, {
      ...draft('One profile for every fan'),
      sections: [
        {
          ...draft('One profile for every fan').sections[0],
          body: 'One profile for every fan, one profile for every fan, one profile for every fan.',
        },
      ],
    });
    expect(
      auditMarketingCopyPage(briefWithBody, {
        ...draft('One profile for every fan'),
        sections: [
          {
            ...draft('One profile for every fan').sections[0],
            body: 'One profile for every fan, one profile for every fan, one profile for every fan.',
          },
        ],
      }).some(issue => issue.code === 'redundant-support')
    ).toBe(true);
    expect(issues.some(issue => issue.code === 'corporate-verb')).toBe(false);
  });
});

// One shared table for both actual groups and all synthetic development cases.
const penGroups = MARKETING_COPY_PEN_PEER_GROUPS;
const peerSnapshots = (groups = penGroups) =>
  groups.map(group => ({
    groupRef: group.ref,
    groupVersion: group.version,
    members: group.members.map(({ ref, value }) => ({ ref, value })),
  }));
const peerAudit = (
  groups = penGroups,
  snapshots = peerSnapshots(groups),
  options: MarketingCopyPeerShadowOptions = {}
) => auditMarketingCopyPeerGroups({ peerGroups: groups }, snapshots, options);
const conventionGroup = (label = 'Get updates'): MarketingCopyPeerGroup => ({
  ...penGroups[0],
  relationship: 'equivalent-peers',
  actor: 'declared test actor',
  members: penGroups[0].members.map((member, i) =>
    i
      ? member
      : {
          ...member,
          value: label,
          role: 'action-label',
          canonicalLabel: label,
          conventionRef: 'fixture:explicit-canonical-label/v1',
        }
  ),
});

describe('fixture-only peer-group shadow pilot', () => {
  it('retains exactly two versioned three-peer groups with honest provenance', () => {
    expect(
      penGroups.map(group => group.members.map(member => member.value))
    ).toEqual([
      ['Get updates', 'Get paid', 'Read by agents'],
      ['Public profile', 'Notify', 'Get paid'],
    ]);
    expect(
      new Set(
        penGroups.flatMap(group => group.members.map(member => member.ref))
      ).size
    ).toBe(6);
    for (const group of penGroups) {
      expect(group.version).toBe('2026-10-26.1');
      expect(group.binding.status).toBe('UNBOUND');
      expect(group.publication).toBe('unknown');
      expect(group.actor).toBeNull();
      expect(group.relationship).toBe('ambiguous');
    }
    expect(
      penGroups.map(group => group.provenance.labelsVisibleInImage)
    ).toEqual([true, false]);
  });

  it.each(penGroups)('abstains on the original ambiguous $ref', group => {
    const [receipt] = peerAudit([group]);
    expect(receipt.coverage).toEqual({
      fixture: 'complete',
      renderedProduction: 'unreviewed',
    });
    expect(
      receipt.checks.filter(check => check.status === 'violation')
    ).toEqual([]);
    expect(
      receipt.checks.find(check => check.check === 'grammar')
    ).toMatchObject({
      status: 'unreviewed',
      verdict: 'insufficient-evidence',
    });
    expect(receipt).toMatchObject({
      mode: 'shadow',
      scope: 'fixture',
      blocking: false,
    });
  });

  it.each(penGroups)(
    'loads all peers when one member of $ref changes or is deleted',
    group => {
      const snapshots = peerSnapshots();
      const target = snapshots.find(
        snapshot => snapshot.groupRef === group.ref
      )!;
      const changed = group.members[0].ref;
      const options = { changedMemberRefs: [changed] };
      expect(
        peerAudit(penGroups, snapshots, options)[0].memberRefs
      ).toHaveLength(3);
      target.members = target.members.filter(member => member.ref !== changed);
      const receipts = peerAudit(penGroups, snapshots, options);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].memberRefs).toEqual(
        group.members.map(member => member.ref)
      );
      expect(receipts[0].coverage.fixture).toBe('failure');
    }
  );

  it.each([
    'omitted',
    'duplicate',
    'unexpected',
    'wrong-version',
    'missing-snapshot',
    'duplicate-snapshot',
    'fake-exemption',
  ])('reports %s extraction as coverage failure', fault => {
    const [snapshot] = peerSnapshots([penGroups[0]]);
    let snapshots = [snapshot];
    if (fault === 'omitted' || fault === 'fake-exemption')
      snapshot.members = snapshot.members.slice(1);
    if (fault === 'duplicate')
      snapshot.members = [
        snapshot.members[0],
        snapshot.members[0],
        snapshot.members[2],
      ];
    if (fault === 'unexpected')
      snapshot.members = [
        ...snapshot.members,
        { ref: 'invented', value: 'Exempt' },
      ];
    if (fault === 'wrong-version') snapshot.groupVersion = 'invented';
    if (fault === 'missing-snapshot') snapshots = [];
    if (fault === 'duplicate-snapshot') snapshots = [snapshot, snapshot];
    if (fault === 'fake-exemption')
      Object.assign(snapshot, {
        writerExemptions: [
          {
            memberRef: penGroups[0].members[0].ref,
            approvedBy: 'writer',
            reason: 'skip',
          },
        ],
      });
    const [receipt] = peerAudit([penGroups[0]], snapshots);
    expect(receipt.coverage.fixture).toBe('failure');
    expect(receipt.checks[0]).toMatchObject({
      check: 'membership',
      status: 'violation',
    });
    expect(receipt.blocking).toBe(false);
  });

  it.each([
    ['Get updates', 'Get Updates', 'violation'],
    ["You're ready", 'You’re ready', 'violation'],
    ["You're ready", 'Youre ready', 'violation'],
    ['Get updates', ' \nGet\t updates  ', 'pass'],
  ] as const)(
    'compares declared %s to %s without erasing protected distinctions',
    (canonical, value, status) => {
      const group = conventionGroup(canonical);
      const snapshots = peerSnapshots([group]);
      const original = peerAudit([group], snapshots)[0];
      snapshots[0].members = snapshots[0].members.map((member, i) =>
        i ? member : { ...member, value }
      );
      const [receipt] = peerAudit([group], snapshots);
      expect(
        receipt.checks.find(check => check.check === 'canonical-label')?.status
      ).toBe(status);
      expect(receipt.inputDigest).not.toBe(original.inputDigest);
    }
  );

  it('does not compare an undeclared role or incomplete extraction', () => {
    const group = conventionGroup();
    const incomplete = peerSnapshots([group]).map(snapshot => ({
      ...snapshot,
      members: snapshot.members.slice(1),
    }));
    expect(
      peerAudit([group], incomplete)[0].checks.find(
        check => check.check === 'canonical-label'
      )?.status
    ).toBe('unreviewed');
    const undeclared = {
      ...group,
      members: group.members.map(member => ({ ...member, role: undefined })),
    };
    expect(
      peerAudit([undeclared])[0].checks.find(
        check => check.check === 'canonical-label'
      )?.status
    ).toBe('unreviewed');
  });

  it.each([
    [
      'timeline',
      ['We started in 2020', 'We serve teams today', 'Next year we expand'],
    ],
    [
      'testimonial',
      [
        '“I was scattered”',
        '“Now I have one profile”',
        '“I will keep using it”',
      ],
    ],
    ['fragment', ['Scattered', 'One profile', 'Acted on']],
    ['noun-label', ['Public profile', 'Notify', 'Get paid']],
  ] as const)('does not impose blanket tense rules on %s', (role, labels) => {
    const group: MarketingCopyPeerGroup = {
      ...penGroups[0],
      relationship: 'progression',
      members: penGroups[0].members.map((member, i) => ({
        ...member,
        role,
        value: labels[i],
      })),
    };
    const [receipt] = peerAudit([group]);
    expect(
      receipt.checks.find(check => check.check === 'grammar')?.status
    ).toBe('unreviewed');
    expect(receipt.checks.some(check => check.status === 'violation')).toBe(
      false
    );
  });

  it.each(['missing', 'expired', 'current'] as const)(
    'keeps %s claim evidence separate from truth',
    freshness => {
      const [receipt] = peerAudit(penGroups, peerSnapshots(), {
        claimEvidence: {
          freshness,
          references:
            freshness === 'missing' ? [] : ['fixture:evidence-observation'],
        },
      });
      expect(
        receipt.checks.find(check => check.check === 'claim-support')
      ).toMatchObject({
        status: 'unreviewed',
        verdict: 'insufficient-evidence',
        uncertainty: [`evidence:${freshness}`],
      });
    }
  );

  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'preserves audience hold over enrollment=%s and consent=%s',
    (enrolled, consent) => {
      const group: MarketingCopyPeerGroup = {
        ...penGroups[0],
        members: penGroups[0].members.map((member, i) =>
          i ? member : { ...member, actionId: 'fixture:audience-delivery' }
        ),
      };
      const [receipt] = peerAudit([group], peerSnapshots([group]), {
        actionEvidence: {
          actionId: 'fixture:audience-delivery',
          enrolled,
          consent,
          holdReferences: ['JOV-8772', 'JOV-8029', 'JOV-8031'],
        },
      });
      expect(
        receipt.checks.find(check => check.check === 'audience-delivery')
      ).toMatchObject({ status: 'violation' });
      expect(receipt.blocking).toBe(false);
    }
  );

  it('cannot infer rendered coverage even from a claimed source binding', () => {
    for (const binding of [
      { status: 'UNBOUND' },
      { status: 'BOUND', sourceRef: 'fixture:claimed-component' },
    ] as const) {
      const [receipt] = peerAudit([{ ...penGroups[0], binding }]);
      expect(receipt.coverage.renderedProduction).toBe('unreviewed');
    }
    expect(auditMarketingCopyPeerGroups({}, [])).toEqual([]);
  });

  it.each(['finding', 'timeout', 'unsupported-locale'] as const)(
    '%s never changes existing pass or fail gate outcomes or their review digest',
    scenario => {
      const group = {
        ...conventionGroup(),
        locale: scenario === 'unsupported-locale' ? 'xx' : 'en',
      };
      const snapshots = peerSnapshots([group]).map(snapshot => ({
        ...snapshot,
        members: snapshot.members.map((member, i) =>
          i ? member : { ...member, value: 'Get Updates' }
        ),
      }));
      const [receipt] = peerAudit([group], snapshots, {
        semanticReview: scenario === 'timeout' ? 'timeout' : 'not-run',
      });
      expect(receipt.blocking).toBe(false);
      if (scenario === 'unsupported-locale')
        expect(
          receipt.checks.find(check => check.check === 'canonical-label')
            ?.status
        ).toBe('unreviewed');
      for (const headline of [
        'One profile for every fan',
        'Concise premium adaptive.',
      ]) {
        const candidate = draft(headline);
        const annotated = { ...brief, peerGroups: [group] };
        expect(auditMarketingCopyPage(annotated, candidate)).toEqual(
          auditMarketingCopyPage(brief, candidate)
        );
        expect(
          auditMarketingCopySemantics(annotated, candidate, {
            enforcement: 'delta',
          })
        ).toEqual(
          auditMarketingCopySemantics(brief, candidate, {
            enforcement: 'delta',
          })
        );
        expect(createMarketingCopyReviewDigest(annotated, candidate)).toBe(
          createMarketingCopyReviewDigest(brief, candidate)
        );
      }
    }
  );
});

it.each([
  'removed-contract-peer',
  'unknown-group',
  'unregistered-version',
  'empty-extraction',
])('cannot certify %s by changing writer-supplied membership', fault => {
  let group = penGroups[0];
  if (fault === 'removed-contract-peer')
    group = { ...group, members: group.members.slice(1) };
  if (fault === 'unknown-group')
    group = { ...group, ref: 'writer:invented-group' };
  if (fault === 'unregistered-version')
    group = { ...group, version: 'writer:invented-version' };
  const snapshots = peerSnapshots([group]);
  if (fault === 'empty-extraction') snapshots[0].members[0].value = '  ';
  const options =
    fault === 'removed-contract-peer'
      ? { changedMemberRefs: [penGroups[0].members[0].ref] }
      : {};
  const receipts = peerAudit([group], snapshots, options);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].coverage.fixture).toBe('failure');
  expect(receipts[0].blocking).toBe(false);
});
