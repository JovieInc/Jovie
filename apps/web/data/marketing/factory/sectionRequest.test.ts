import { describe, expect, it } from 'vitest';
import { resolveComposition } from '../composition';
import {
  findProposedSectionForJob,
  SECTION_REQUEST_GOVERNANCE,
} from '../designGaps';
import {
  createSectionRequest,
  detectSectionGaps,
  filterNewSectionRequests,
  getSectionOmitRung,
  renderSectionRequestIssue,
  SECTION_REQUEST_LINEAR_LABEL,
} from './sectionRequest';
import { FACTORY_STAGE_ARTIFACT_SCHEMAS } from './spine';

const brief = (businessObjective: string) => ({
  businessObjective,
  targetAudience: 'general' as const,
  desiredConversion: 'start' as const,
  trafficSource: 'home' as const,
  intent: 'category' as const,
});

const roiNeed = {
  job: 'campaign-roi-calculator',
  contentShape: { headline: 44, body: 120 },
  mediaNeed: 'none',
  evidence: ['route:/solutions/agencies'],
};

describe('factory section requests', () => {
  it('emits a request and degrades instead of forking a missing family', () => {
    const composition = resolveComposition(brief('Explain managed campaigns'), {
      sectionJobs: [roiNeed],
    });

    expect(composition.degraded).toBe(true);
    expect(composition.shadowRequired).toBe(false);
    expect(composition.sectionRequests).toHaveLength(1);
    expect(composition.sectionRequests?.[0]).toMatchObject({
      job: 'campaign-roi-calculator',
      contentShape: 'body,headline',
      mediaNeed: 'none',
      essential: false,
      evidence: expect.arrayContaining([
        'route:/solutions/agencies',
        'content:headline=44',
        expect.stringContaining('LANDING_PAGE_FAMILIES'),
      ]),
      dedupeKey:
        'factory:section-request:campaign-roi-calculator:none:body,headline',
    });
    expect(composition.trace).toContainEqual(
      expect.objectContaining({ step: 'composition-degradation' })
    );
    expect(SECTION_REQUEST_GOVERNANCE.localComponentFallback).toBe('forbidden');
  });

  it('reports an over-budget section but refuses to omit a required story beat', () => {
    const baseline = resolveComposition(brief('Explain the product'));
    expect(baseline.sections.map(s => s.sectionId)).toContain('feature-split');

    const sectionJobs = [
      {
        job: 'feature-split',
        contentShape: { headline: 65, body: 221 },
        mediaNeed: 'real-product-screenshot',
        evidence: ['route:/product'],
      },
    ];
    const report = detectSectionGaps(sectionJobs);

    expect(report.requests[0]).toMatchObject({
      sectionId: 'feature-split',
    });
    expect(report.requests[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'section.feature-split headline=65 exceeds desktop=64 or mobile=44'
        ),
        expect.stringContaining('design-gap:PROPOSED-SECTION-0001'),
      ])
    );
    expect(() =>
      resolveComposition(brief('Explain the product'), { sectionJobs })
    ).toThrow('Incomplete story');
  });

  it('keeps exactly one hero and requires shadow when the hero job has a gap', () => {
    const composition = resolveComposition(brief('Hero overflow'), {
      sectionJobs: [
        {
          job: 'hero',
          contentShape: { headline: 140 },
          mediaNeed: 'none',
          evidence: ['route:/overflow'],
        },
      ],
    });

    expect(composition.shadowRequired).toBe(true);
    expect(composition.sectionRequests?.[0]).toMatchObject({
      job: 'hero',
      essential: true,
    });
    expect(
      composition.sections.filter(s => s.sectionId === 'hero')
    ).toHaveLength(1);
    expect(composition.sections[0]?.sectionId).toBe('hero');
    expect(composition.trace).toContainEqual(
      expect.objectContaining({ step: 'gap-hero-preserved' })
    );
  });

  it('marks the page shadow-required for an explicitly essential job', () => {
    const composition = resolveComposition(brief('Essential calculator'), {
      sectionJobs: [{ ...roiNeed, essential: true }],
    });

    expect(composition.degraded).toBe(true);
    expect(composition.shadowRequired).toBe(true);
    expect(composition.sectionRequests?.[0]?.essential).toBe(true);
  });

  it('collapses the same gap from two pages into one request', () => {
    const firstPage = resolveComposition(brief('Agency page'), {
      sectionJobs: [roiNeed],
    });
    const secondPage = resolveComposition(brief('Enterprise page'), {
      sectionJobs: [
        {
          ...roiNeed,
          contentShape: { headline: 46, body: 118 },
          evidence: ['route:/enterprise'],
        },
      ],
      existingSectionRequests: firstPage.sectionRequests,
    });

    expect(secondPage.sectionRequests).toHaveLength(1);
    expect(secondPage.sectionRequests?.[0]?.evidence).toEqual(
      expect.arrayContaining(['route:/solutions/agencies', 'route:/enterprise'])
    );
    expect(secondPage.sectionRequests?.[0]?.dedupeKey).toBe(
      firstPage.sectionRequests?.[0]?.dedupeKey
    );

    const parsedGapReport = FACTORY_STAGE_ARTIFACT_SCHEMAS[
      'gap-detection'
    ].parse({
      pageId: 'two-pages',
      sectionRequests: secondPage.sectionRequests,
    });
    expect(parsedGapReport.sectionRequests[0]?.dedupeKey).toBe(
      secondPage.sectionRequests?.[0]?.dedupeKey
    );
  });

  it('returns no request when certified sections serve every job', () => {
    const report = detectSectionGaps([
      {
        job: 'hero',
        contentShape: { headline: 40, subhead: 90 },
        mediaNeed: 'real-product-screenshot',
        evidence: ['route:/'],
      },
      {
        job: 'faq',
        contentShape: { question: 40 },
        mediaNeed: 'none',
        evidence: ['route:/'],
      },
    ]);
    expect(report).toEqual({ requests: [], registryGaps: [] });

    const composition = resolveComposition(brief('Served page'), {
      sectionJobs: [
        {
          job: 'hero',
          contentShape: { headline: 40 },
          mediaNeed: 'none',
          evidence: ['route:/'],
        },
      ],
    });
    expect(composition.degraded).toBe(false);
    expect(composition.shadowRequired).toBe(false);
    expect(composition.sectionRequests).toEqual([]);
    expect(composition.sections).toEqual(
      resolveComposition(brief('Served page')).sections
    );
  });

  it('classifies designed sections missing a family as registry gaps, not requests', () => {
    const report = detectSectionGaps([
      {
        job: 'content-prose',
        contentShape: { paragraph: 200 },
        mediaNeed: 'none',
        evidence: ['route:/blog/post'],
      },
      {
        job: 'blog-feed',
        contentShape: { 'post-title': 40 },
        mediaNeed: 'none',
        evidence: ['route:/blog'],
      },
    ]);

    expect(report.requests).toEqual([]);
    expect(report.registryGaps.map(gap => gap.sectionId)).toEqual([
      'content-prose',
      'blog-feed',
    ]);
    expect(report.registryGaps[1]?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining('not source-backed')])
    );

    const seoPage = resolveComposition(
      {
        businessObjective: 'Answer a question',
        targetAudience: 'general',
        desiredConversion: 'none',
        intent: 'informational',
      },
      {
        sectionJobs: [
          {
            job: 'content-prose',
            contentShape: { paragraph: 200 },
            mediaNeed: 'none',
            evidence: ['route:/blog/post'],
          },
        ],
      }
    );
    expect(seoPage.degraded).toBe(false);
    expect(seoPage.sectionRequests).toEqual([]);
    expect(seoPage.sections.map(s => s.sectionId)).toContain('content-prose');
    expect(seoPage.trace).toContainEqual(
      expect.objectContaining({ step: 'registry-gap' })
    );
  });

  it('still requests a family-less section when content overflows its budget', () => {
    const report = detectSectionGaps([
      {
        job: 'content-prose',
        contentShape: { headline: 400 },
        mediaNeed: 'none',
        evidence: ['route:/blog/long'],
      },
    ]);
    expect(report.registryGaps).toEqual([]);
    expect(report.requests[0]).toMatchObject({ sectionId: 'content-prose' });
  });

  it('links jobs already tracked in PROPOSED_SECTIONS instead of filing new issues', () => {
    expect(findProposedSectionForJob('Download platform selector')?.id).toBe(
      'PROPOSED-SECTION-0004'
    );
    expect(findProposedSectionForJob('campaign-roi-calculator')).toBeNull();

    const known = createSectionRequest(
      {
        job: 'download-platform-selector',
        contentShape: { headline: 30 },
        mediaNeed: 'none',
        evidence: ['route:/download'],
      },
      ['no family']
    );
    const fresh = createSectionRequest(roiNeed, ['no family']);
    expect(known.proposalId).toBe('PROPOSED-SECTION-0004');
    expect(filterNewSectionRequests([known, fresh])).toEqual([fresh]);
  });

  it('renders a Linear issue body with the path to canonical', () => {
    const [request] = detectSectionGaps([roiNeed]).requests;
    if (!request) throw new Error('expected a section request');
    const issue = renderSectionRequestIssue(request);

    expect(issue.labels).toEqual([SECTION_REQUEST_LINEAR_LABEL]);
    expect(issue.title).toBe(
      'Section request: campaign-roi-calculator (body,headline)'
    );
    expect(issue.body).toContain(request.dedupeKey);
    expect(issue.body).toContain('**pen**: STAGING proposal');
    expect(issue.body).toContain('frontend-skill and design-canonical audits');
    expect(issue.body).toContain('**promotion**: registry promotion');
    expect(issue.body).toContain('route:/solutions/agencies');
    expect(issue.body).not.toContain('—');
  });

  it('maps sections to the OMIT rung of their degradation ladder', () => {
    expect(getSectionOmitRung('stats')).toMatchObject({
      assetClass: 'proof-data',
      tier: 5,
    });
    expect(getSectionOmitRung('faq')).toBeNull();
  });
});
