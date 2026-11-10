import { describe, expect, it } from 'vitest';

import {
  buildWinbackDraftCopy,
  buildWinbackResumeUrl,
  diffNewlyShippedCertifiedCapabilities,
  formatWantList,
  isWithinWinbackOutreachBudget,
  parseShippedCapabilities,
  WINBACK_EMAIL_TEMPLATE_VERSION,
  WINBACK_OUTREACH_BUDGET_DAYS,
  winbackSendApprovalError,
} from '@/lib/waitlist/winback';

// ---------------------------------------------------------------------------
// Pure logic.
// ---------------------------------------------------------------------------

const REGISTRY_EXCERPT = `
## Stable Feature IDs

| Feature ID | Product feature |
|---|---|
| smart-link-editing-and-customization | Smart link editing and customization |
| public-profile-pages | Public profile pages |

## Product Feature List

| Product area | Feature | Status | Access model | Flag / Gate | Notes |
|---|---|---|---|---|---|
| Smart Links | Smart link editing and customization | Shipped | Free+ | None | |
| Profile | Public profile pages | Shipped (internal v1 default-on) | Free+ | None | |
| Growth (Coming Soon) | A/B testing | Planned | Growth | None | |
| Conversion | Subscribe CTA variant experiment | In rollout | Flag-gated | | |
| Unstable | Something unreleased | Proposal | None | None | |
`;

describe('parseShippedCapabilities', () => {
  it('parses shipped rows into stable-id capability keys', () => {
    const capabilities = parseShippedCapabilities(REGISTRY_EXCERPT);
    expect(capabilities).toEqual([
      {
        key: 'smart-link-editing-and-customization',
        label: 'Smart link editing and customization',
        status: 'Shipped',
      },
      {
        key: 'public-profile-pages',
        label: 'Public profile pages',
        status: 'Shipped (internal v1 default-on)',
      },
    ]);
  });

  it('never counts Planned / In rollout / Proposal rows as shipped', () => {
    const keys = parseShippedCapabilities(REGISTRY_EXCERPT).map(c => c.key);
    expect(keys).not.toContain('a-b-testing');
    expect(keys).not.toContain('subscribe-cta-variant-experiment');
    expect(keys).not.toContain('something-unreleased');
  });
});

describe('diffNewlyShippedCertifiedCapabilities', () => {
  const registry = REGISTRY_EXCERPT;

  it('reports shipped+certified keys and the delta since the watermark', () => {
    const first = diffNewlyShippedCertifiedCapabilities({
      registryMarkdown: registry,
      certifiedKeys: [
        'smart-link-editing-and-customization',
        'public-profile-pages',
      ],
      previousKeys: null,
    });
    expect(first.currentKeys).toEqual([
      'smart-link-editing-and-customization',
      'public-profile-pages',
    ]);
    expect(first.newlyAvailable).toEqual([
      'smart-link-editing-and-customization',
      'public-profile-pages',
    ]);

    const second = diffNewlyShippedCertifiedCapabilities({
      registryMarkdown: registry,
      certifiedKeys: [
        'smart-link-editing-and-customization',
        'public-profile-pages',
      ],
      previousKeys: first.currentKeys,
    });
    expect(second.newlyAvailable).toEqual([]);
  });

  it('only includes certified keys', () => {
    const diff = diffNewlyShippedCertifiedCapabilities({
      registryMarkdown: registry,
      certifiedKeys: ['public-profile-pages'],
      previousKeys: null,
    });
    expect(diff.currentKeys).toEqual(['public-profile-pages']);
  });
});

describe('formatWantList', () => {
  it('joins wants as "a, b and c"', () => {
    expect(formatWantList(['sell vinyl', 'tour dates', 'smart links'])).toBe(
      'sell vinyl, tour dates and smart links'
    );
    expect(formatWantList(['sell vinyl', 'tour dates'])).toBe(
      'sell vinyl and tour dates'
    );
    expect(formatWantList(['sell vinyl'])).toBe('sell vinyl');
  });

  it('caps the list at three wants', () => {
    expect(formatWantList(['a', 'b', 'c', 'd'])).toBe('a, b and c');
  });
});

describe('buildWinbackDraftCopy', () => {
  it('renders the founder-locked copy verbatim', () => {
    const copy = buildWinbackDraftCopy({
      wants: ['sell vinyl', 'tour dates'],
      capabilityLabel: 'tour dates',
      handle: 'moonrunner',
      resumeUrl: 'https://jov.ie/start?resume=winback&w=t0k3n',
    });
    expect(copy.subject).toBe('We just shipped tour dates');
    expect(copy.body).toBe(
      "You reached out wanting to sell vinyl and tour dates. We weren't ready then. " +
        "We just shipped tour dates, and we'd love for you to be the first to try it. " +
        'Your handle jov.ie/moonrunner is still yours: ' +
        'https://jov.ie/start?resume=winback&w=t0k3n'
    );
  });
});

describe('buildWinbackResumeUrl', () => {
  it('builds /start?resume=winback&w=<token>', () => {
    expect(buildWinbackResumeUrl('https://jov.ie', 'tok')).toBe(
      'https://jov.ie/start?resume=winback&w=tok'
    );
  });
});

describe('isWithinWinbackOutreachBudget', () => {
  const now = new Date('2026-11-09T12:00:00.000Z');

  it('is free when nothing was sent', () => {
    expect(
      isWithinWinbackOutreachBudget({ lastUnansweredSentAt: null, now })
    ).toBe(true);
  });

  it('blocks within 14 days of an unanswered send (JOV-6655)', () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(
      isWithinWinbackOutreachBudget({ lastUnansweredSentAt: tenDaysAgo, now })
    ).toBe(false);
  });

  it('allows again once the budget window has elapsed', () => {
    const windowAgo = new Date(
      now.getTime() - WINBACK_OUTREACH_BUDGET_DAYS * 24 * 60 * 60 * 1000
    );
    expect(
      isWithinWinbackOutreachBudget({ lastUnansweredSentAt: windowAgo, now })
    ).toBe(true);
  });

  it('allows when the last send was answered', () => {
    // An answered send is represented by the caller as null (no unanswered
    // send outstanding).
    expect(
      isWithinWinbackOutreachBudget({ lastUnansweredSentAt: null, now })
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Approval record — the ONLY thing that can authorize a send.
// ---------------------------------------------------------------------------

const APPROVAL_RECORD = {
  contract: 'jovie.winback-approval/v1',
  batchId: 'batch-2026-11-09-a',
  capabilityKey: 'public-profile-pages',
  templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
  entryIds: ['11111111-1111-4111-8111-111111111111'],
  approvedBy: 'tim',
  approvedAt: '2026-11-09T12:00:00.000Z',
};

describe('winbackSendApprovalError', () => {
  const entryId = '11111111-1111-4111-8111-111111111111';

  it('accepts a valid record covering the entry', () => {
    expect(
      winbackSendApprovalError(APPROVAL_RECORD, {
        batchId: 'batch-2026-11-09-a',
        templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
        entryId,
      })
    ).toBeNull();
  });

  it('refuses when there is no approval record at all', () => {
    expect(
      winbackSendApprovalError(undefined, {
        batchId: 'batch-2026-11-09-a',
        templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
        entryId,
      })
    ).toMatch(/no valid approval record/);
    expect(
      winbackSendApprovalError(
        {},
        {
          batchId: 'batch-2026-11-09-a',
          templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
          entryId,
        }
      )
    ).toMatch(/no valid approval record/);
  });

  it('refuses a record whose template version does not match the job', () => {
    expect(
      winbackSendApprovalError(
        {
          ...APPROVAL_RECORD,
          templateVersion: 'winback_capability_shipped/v0',
        },
        {
          batchId: 'batch-2026-11-09-a',
          templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
          entryId,
        }
      )
    ).toMatch(/template/);
  });

  it('refuses an entry that is not in the approved batch', () => {
    expect(
      winbackSendApprovalError(APPROVAL_RECORD, {
        batchId: 'batch-2026-11-09-a',
        templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
        entryId: '22222222-2222-4222-8222-222222222222',
      })
    ).toMatch(/not in approved batch/);
  });

  it('refuses a record with a different contract or batch', () => {
    expect(
      winbackSendApprovalError(
        { ...APPROVAL_RECORD, contract: 'other/v1' },
        {
          batchId: 'batch-2026-11-09-a',
          templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
          entryId,
        }
      )
    ).toMatch(/no valid approval record/);
    expect(
      winbackSendApprovalError(
        { ...APPROVAL_RECORD, batchId: 'other-batch' },
        {
          batchId: 'batch-2026-11-09-a',
          templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
          entryId,
        }
      )
    ).toMatch(/does not match job batch/);
  });
});
