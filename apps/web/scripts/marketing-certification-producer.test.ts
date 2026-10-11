import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateCertificationAdmission } from '@/lib/agent-os/certification';
import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';
import {
  affectedEntries,
  buildPacket,
  CERTIFICATION_INPUT_GLOBS,
  certificationPlans,
  defectReceipts,
  fileDefects,
  postCertificationPacket,
  selectCertificationPlans,
  storyFileFor,
  testFilesFor,
} from './marketing-certification-producer';

const SHA = 'b'.repeat(40);
const footer = MARKETING_COMPONENT_REGISTRY.find(
  entry => entry.id === 'shell.footer'
);
if (!footer?.resolvedSource)
  throw new Error('fixture entry shell.footer must be source-backed');

function report(file: string, title: string, status: string) {
  return {
    testResults: [
      {
        name: `/repo/apps/web/${file}`,
        status,
        assertionResults: [{ title, status }],
      },
    ],
  };
}

const invariantsPassed = {
  testResults: [
    'tests/unit/marketing/component-registry.test.ts',
    'tests/unit/marketing/landing-page-grammar.test.ts',
    'tests/unit/marketing/recipe-manifest.test.ts',
  ].map(name => ({
    name: `/repo/apps/web/${name}`,
    status: 'passed',
    assertionResults: [{ title: 'x', status: 'passed' }],
  })),
};

function packetFor(overrides: Partial<Parameters<typeof buildPacket>[0]> = {}) {
  return buildPacket({
    entry: footer!,
    sha: SHA,
    runRef: 'run',
    penIssueIds: new Set(),
    invariants: invariantsPassed,
    ownTests: report(
      'components/site/MarketingFooter.test.tsx',
      'renders',
      'passed'
    ),
    ownTestFiles: ['components/site/MarketingFooter.test.tsx'],
    stories: report(
      'components/marketing/storybook/MarketingShells.stories.tsx',
      'MarketingFooter',
      'passed'
    ),
    story: {
      path: 'components/marketing/storybook/MarketingShells.stories.tsx',
      storyName: 'MarketingFooter',
    },
    sourceDigest: 'c'.repeat(64),
    ...overrides,
  });
}

describe('marketing certification producer', () => {
  const selectionFixture = [
    {
      id: 'hero',
      dependencies: [
        'apps/web/components/homepage/Hero.tsx',
        'apps/web/tests/unit/home/Hero.test.tsx',
      ],
    },
    {
      id: 'footer',
      dependencies: [
        'apps/web/components/site/Footer.tsx',
        'apps/web/components/site/Footer.test.tsx',
        'apps/web/components/marketing/Footer.stories.tsx',
      ],
    },
  ];

  it.each([
    'apps/web/data/homepageIdentityCopy.ts',
    'apps/web/components/homepage/HomepageIdentity.css',
    'apps/web/data/marketing/componentRegistry.ts',
    'apps/web/data/marketing/landingPageGrammar.ts',
    'apps/web/app/(home)/page.tsx',
    'apps/web/app/(marketing)/product/page.tsx',
    'apps/web/app/layout.tsx',
    'apps/web/styles/tokens.css',
    'apps/web/public/assets/generated/hero.webp',
    'apps/web/lib/flags/marketing-static.ts',
    'packages/ui/src/button.tsx',
    'packages/copy/src/index.ts',
    'canon/invariants.jsonl',
    'pnpm-lock.yaml',
    'apps/web/vitest.config.storybook.mts',
    'apps/web/tests/setup.ts',
    'apps/web/tests/setup-browser.ts',
    'apps/web/tests/setup-db.ts',
    'docs/marketing/SECTION_CATALOG.md',
    'docs/design-system/molecule-ownership-receipt.json',
    'scripts/agent/pen-workspace-locks.json',
  ])(
    're-certifies all entries for shared input %s without requiring it to exist',
    path => {
      const selection = selectCertificationPlans(
        selectionFixture,
        [path],
        false
      );
      expect(selection).toEqual({
        plans: selectionFixture,
        reason: 'shared-input',
        invalidatedBy: [path],
      });
    }
  );

  it('does not let a direct test hit hide another shared input in the same push', () => {
    const direct = 'apps/web/tests/unit/home/Hero.test.tsx';
    const shared = 'apps/web/data/homepageIdentityCopy.ts';
    for (const changed of [
      [direct, shared],
      [shared, direct],
    ]) {
      expect(
        selectCertificationPlans(selectionFixture, changed, false)
      ).toEqual({
        plans: selectionFixture,
        reason: 'shared-input',
        invalidatedBy: [shared],
      });
    }
  });

  it('re-certifies consumers when a registered component changes, not just its own entry', () => {
    expect(
      selectCertificationPlans(
        selectionFixture,
        [selectionFixture[0].dependencies[0]],
        false
      ).plans
    ).toEqual(selectionFixture);
  });

  it.each([
    'apps/web/tests/unit/marketing/component-registry.test.ts',
    'apps/web/tests/unit/home/new-homepage.test.tsx',
    'apps/web/components/marketing/deleted.stories.tsx',
    'apps/web/components/site/deleted.stories.tsx',
    'apps/web/data/marketing/copy.test.ts',
  ])(
    'fails closed for unmapped marketing or global invariant evidence %s',
    path => {
      expect(
        selectCertificationPlans(selectionFixture, [path], false).reason
      ).toBe('shared-input');
    }
  );

  it('keeps isolated declared test and story changes targeted', () => {
    for (const path of selectionFixture[1].dependencies.slice(1)) {
      expect(selectCertificationPlans(selectionFixture, [path], false)).toEqual(
        {
          plans: [selectionFixture[1]],
          reason: 'direct-dependency',
          invalidatedBy: [path],
        }
      );
    }
  });

  it('keeps unrelated docs, authenticated routes, API implementation and tests out of the sweep', () => {
    const changed = [
      'README.md',
      'apps/web/app/app/dashboard/page.tsx',
      'apps/web/app/api/billing/route.ts',
      'apps/web/tests/unit/billing/invoice.test.ts',
    ];
    expect(selectCertificationPlans(selectionFixture, changed, false)).toEqual({
      plans: [],
      reason: 'unaffected',
      invalidatedBy: [],
    });
    expect(
      selectCertificationPlans(selectionFixture, changed, true).reason
    ).toBe('explicit-all');
  });

  it('retains renamed or deleted coverage dependencies and reports missing tests instead of dropping them', () => {
    const oldPath = 'apps/web/tests/unit/home/old-hero.test.tsx';
    const newPath = 'apps/web/tests/unit/home/new-hero.test.tsx';
    const plans = certificationPlans({
      entries: [footer!],
      storyFiles: [],
      all: false,
      changed: [oldPath, newPath],
      exists: () => false,
      readSource: () => `// @coverage-via ${oldPath}\nexport {};`,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0].dependencies).toContain(oldPath);
    expect(plans[0].ownTestFiles).toEqual([
      'tests/unit/home/old-hero.test.tsx',
    ]);
    const packet = packetFor({
      ownTestFiles: plans[0].ownTestFiles,
      ownTests: null,
    });
    expect(packet.testsCoverage[0].status).toBe('missing');
    expect(
      evaluateCertificationAdmission({
        packet,
        evaluatedAt: '2026-09-30T00:00:00.000Z',
      }).state
    ).not.toBe('review_ready');
  });

  it.each([false, true])(
    'reports a deleted implicit sibling as missing even with surviving coverage (all=%s)',
    all => {
      const sibling = footer!.resolvedSource!.replace(/\.tsx?$/u, '.test.tsx');
      const via = 'apps/web/tests/unit/marketing/footer-links.test.ts';
      const plans = certificationPlans({
        entries: [footer!],
        storyFiles: [],
        all,
        changed: [sibling],
        exists: path => path === via,
        readSource: () => `// @coverage-via ${via}\nexport {};`,
      });
      expect(plans).toHaveLength(1);
      expect(plans[0].ownTestFiles).toContain(
        sibling.replace(/^apps\/web\//u, '')
      );
      const packet = packetFor({
        ownTestFiles: plans[0].ownTestFiles,
        ownTests: report(
          via.replace(/^apps\/web\//u, ''),
          'links resolve',
          'passed'
        ),
      });
      expect(packet.testsCoverage[0].status).toBe('missing');
    }
  );

  it('keeps workflow trigger coverage aligned and includes both sides of a rename', () => {
    const workflow = readFileSync(
      resolve(
        __dirname,
        '../../../.github/workflows/marketing-certification-producer.yml'
      ),
      'utf8'
    );
    const paths =
      workflow.split('    paths:\n')[1]?.split('  schedule:')[0] ?? '';
    const actual = [...paths.matchAll(/^      - '([^']+)'$/gmu)].map(
      match => match[1]
    );
    expect(actual).toEqual([...CERTIFICATION_INPUT_GLOBS]);
    expect(workflow).toContain(
      "--jq '.files[] | .filename, .previous_filename // empty'"
    );
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('selects entries whose source, declared tests or story changed', () => {
    const plans = [
      { id: 'a', dependencies: ['apps/web/a.tsx', 'apps/web/a.test.tsx'] },
      { id: 'b', dependencies: ['apps/web/b.tsx', 'apps/web/b.stories.tsx'] },
    ];
    expect(
      affectedEntries(plans, ['apps/web/a.test.tsx']).map(p => p.id)
    ).toEqual(['a']);
    expect(
      affectedEntries(plans, ['apps/web/b.stories.tsx', 'README.md']).map(
        p => p.id
      )
    ).toEqual(['b']);
    expect(affectedEntries(plans, ['a.tsx'])).toEqual([]);
  });

  it('certifies with the sibling test plus declared @coverage-via targets', () => {
    const source =
      '// @coverage-via apps/web/tests/unit/x.test.ts\n// @coverage-via apps/web/tests/unit/gone.test.ts\nexport {};';
    const existing = new Set([
      'apps/web/c/X.test.tsx',
      'apps/web/tests/unit/x.test.ts',
    ]);
    expect(
      testFilesFor('apps/web/c/X.tsx', source, p => existing.has(p))
    ).toEqual(['apps/web/c/X.test.tsx', 'apps/web/tests/unit/x.test.ts']);
    expect(testFilesFor('apps/web/c/Y.tsx', 'export {};', () => false)).toEqual(
      []
    );
  });

  it('plans each entry with source+test+story dependencies and re-runs on any hit', () => {
    const via = 'apps/web/tests/unit/marketing/footer-links.test.ts';
    const storyFiles = [
      { path: 'shells.stories.tsx', title: footer!.storybookTitle },
    ];
    const base = {
      entries: [footer!],
      storyFiles,
      exists: (path: string) => path === via,
      readSource: () => `// @coverage-via ${via}\nexport {};`,
    };
    const all = certificationPlans({ ...base, all: true, changed: [] });
    expect(all).toHaveLength(1);
    expect(all[0].dependencies).toEqual([
      footer!.resolvedSource,
      footer!.resolvedSource!.replace(/\.tsx?$/u, '.test.tsx'),
      via,
      'apps/web/shells.stories.tsx',
    ]);
    expect(all[0].ownTestFiles).toEqual([
      'tests/unit/marketing/footer-links.test.ts',
    ]);
    const selected = (changed: string[]) =>
      certificationPlans({ ...base, all: false, changed }).map(
        plan => plan.entry.id
      );
    expect(selected(['README.md'])).toEqual([]);
    expect(selected([via])).toEqual(['shell.footer']);
    expect(selected(['apps/web/shells.stories.tsx'])).toEqual(['shell.footer']);
    expect(selected([footer!.resolvedSource!])).toEqual(['shell.footer']);
  });

  it('resolves a story from its meta title plus story name', () => {
    const files = [
      { path: 'shells.stories.tsx', title: 'Marketing/Shells' },
      { path: 'hero.stories.tsx', title: 'Marketing/Sections/Hero' },
    ];
    expect(storyFileFor('Marketing/Shells/MarketingFooter', files)).toEqual({
      path: 'shells.stories.tsx',
      storyName: 'MarketingFooter',
    });
    expect(storyFileFor('Marketing/Sections/Hero', files)).toEqual({
      path: 'hero.stories.tsx',
      storyName: '',
    });
    expect(storyFileFor('Marketing/Recipes/Nope', files)).toBeNull();
  });

  it('a fully evidenced entry is admitted as machine-passed review_ready', () => {
    const admission = evaluateCertificationAdmission({
      packet: packetFor(),
      evaluatedAt: '2026-09-28T01:00:00.000Z',
    });
    expect(admission.blockers).toEqual([]);
    expect(admission.state).toBe('review_ready');
  });

  it('aggregates multiple certifying test files: any failure fails, any gap reports', () => {
    const twoFiles = [
      'components/site/MarketingFooter.test.tsx',
      'tests/unit/marketing/footer-links.test.ts',
    ];
    const failed = packetFor({
      ownTests: {
        testResults: [
          {
            name: '/repo/apps/web/components/site/MarketingFooter.test.tsx',
            status: 'passed',
            assertionResults: [{ title: 'renders', status: 'passed' }],
          },
          {
            name: '/repo/apps/web/tests/unit/marketing/footer-links.test.ts',
            status: 'failed',
            assertionResults: [{ title: 'links resolve', status: 'failed' }],
          },
        ],
      },
      ownTestFiles: twoFiles,
    });
    expect(failed.testsCoverage[0].status).toBe('failed');
    const missingAndFailed = packetFor({
      ownTests: report(
        'tests/unit/marketing/footer-links.test.ts',
        'links resolve',
        'failed'
      ),
      ownTestFiles: twoFiles,
    });
    expect(missingAndFailed.testsCoverage[0].status).toBe('failed');
    const partialMissing = packetFor({ ownTestFiles: twoFiles });
    expect(partialMissing.testsCoverage[0].status).toBe('missing');
  });

  it('never reports missing or failed evidence as passed', () => {
    const noTest = packetFor({ ownTestFiles: [], ownTests: null });
    expect(noTest.testsCoverage[0].status).toBe('missing');
    const brokenStory = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    expect(brokenStory.visualProof[0].status).toBe('failed');
    const wrongStory = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'OtherStory',
        'passed'
      ),
    });
    expect(wrongStory.visualProof[0].status).toBe('missing');
    const penFlagged = packetFor({ penIssueIds: new Set(['shell.footer']) });
    expect(penFlagged.canonicalReferences[0].status).toBe('failed');
    for (const packet of [noTest, brokenStory, wrongStory, penFlagged]) {
      expect(evaluateCertificationAdmission({ packet }).state).toBe('working');
    }
  });

  it('files real defects once per entry and tier, never missing evidence', () => {
    expect(defectReceipts(packetFor())).toEqual([]);
    expect(
      defectReceipts(packetFor({ ownTestFiles: [], ownTests: null }))
    ).toEqual([]);
    const broken = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    expect(defectReceipts(broken)).toEqual([
      expect.objectContaining({
        fingerprint: 'marketing-cert:shell.footer:visual_proof',
        tier: 'visual_proof',
      }),
    ]);
  });

  it('upserts one fingerprinted issue per defect only when Linear is configured', async () => {
    const broken = packetFor({
      stories: report(
        'components/marketing/storybook/MarketingShells.stories.tsx',
        'MarketingFooter',
        'failed'
      ),
    });
    const calls: {
      fingerprint: string;
      title: string;
      description: string;
      reopenTerminal?: boolean;
    }[] = [];
    const upsert = async (input: (typeof calls)[number]) => {
      calls.push(input);
      return { ok: true, action: 'created' };
    };
    const previous = process.env.LINEAR_API_KEY;
    try {
      delete process.env.LINEAR_API_KEY;
      expect(await fileDefects(broken, SHA, async () => upsert)).toBe(0);
      process.env.LINEAR_API_KEY = 'lin_test';
      expect(await fileDefects(packetFor(), SHA, async () => upsert)).toBe(0);
      expect(await fileDefects(broken, SHA, async () => upsert)).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.LINEAR_API_KEY;
      else process.env.LINEAR_API_KEY = previous;
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      fingerprint: 'marketing-cert:shell.footer:visual_proof',
      title: expect.stringContaining('shell.footer visual_proof'),
      reopenTerminal: true,
    });
    expect(calls[0]?.description).toContain(SHA);
  });
});

describe('postCertificationPacket', () => {
  const packet = buildPacket({
    entry: footer,
    sha: SHA,
    runRef: 'run',
    penIssueIds: new Set(),
    invariants: null,
    ownTests: null,
    ownTestFiles: [],
    stories: null,
    story: null,
    sourceDigest: null,
  });

  it('posts the packet with bearer auth to the ingest route', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: URL, init: RequestInit) => {
      calls.push({ url: url.toString(), init });
      return new Response('{"state":"pending"}', { status: 202 });
    }) as unknown as typeof fetch;
    const result = await postCertificationPacket(
      'https://example.test',
      'secret',
      packet,
      fakeFetch
    );
    expect(result).toEqual({ ok: true, summary: '202 {"state":"pending"}' });
    expect(calls[0]?.url).toBe(
      'https://example.test/api/internal/ovie/certification-evidence'
    );
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization
    ).toBe('Bearer secret');
    expect(JSON.parse(String(calls[0]?.init.body)).packet.subject.id).toBe(
      'shell.footer'
    );
  });

  it('reports a rejected post as not ok', async () => {
    const fakeFetch = (async () =>
      new Response('nope', { status: 401 })) as unknown as typeof fetch;
    const result = await postCertificationPacket(
      'https://example.test',
      'bad',
      packet,
      fakeFetch
    );
    expect(result).toEqual({ ok: false, summary: '401 nope' });
  });
});
