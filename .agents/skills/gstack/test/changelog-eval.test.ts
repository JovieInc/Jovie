import { describe, expect, test } from 'bun:test';
import {
  CHANGELOG_EVAL_SCHEMA,
  evaluateChangelog,
  isCanonicalChangelogPath,
  type ChangelogEvalInput,
  type ChangelogPriority,
  type ChangelogSourceItem,
  type ChangelogStory,
} from '../scripts/changelog-eval';
function publicSource(
  id: string,
  groupKey: string,
  audience: string,
  action: string,
  outcome: string
): ChangelogSourceItem {
  return {
    id, groupKey, audience,
    availability: 'released in 26.8.0',
    action, outcome, disposition: 'public', storyId: groupKey,
  };
}
function releasedStory(
  id: string,
  section: ChangelogStory['section'],
  priority: ChangelogPriority,
  headline: string,
  summary: string,
  sourceIds: string[]
): ChangelogStory {
  return {
    id, section, priority, headline, summary, sourceIds,
    availabilityEvidence: {
      status: 'released', release: '26.8.0', type: 'git_tag',
      reference: 'v26.8.0@a94166f4069664e57220f295e4759976a9282863',
    },
  };
}
function validInput(): ChangelogEvalInput {
  return {
    schema: CHANGELOG_EVAL_SCHEMA,
    release: '26.8.0',
    iteration: 1,
    sourceItems: [
      publicSource('JOV-4578', 'brand-deals-inbox', 'creators', 'review a deal', 'make a deal decision'),
      publicSource('JOV-4539', 'mac-recovery', 'Mac app users', 'recover the app', 'return to Jovie'),
      publicSource('JOV-5086', 'mac-recovery', 'Mac app users', 'recover the app', 'return to Jovie'),
      publicSource('JOV-4799', 'presence-workspace', 'artists', 'review visibility', 'understand visibility'),
      {
        id: 'JOV-5013', groupKey: 'deployment-health', audience: 'operators',
        availability: 'internal', action: 'verify deployment health', outcome: 'safe deployment promotion', disposition: 'internal',
        exclusionReason: 'Deployment implementation is not customer-facing.',
      },
    ],
    stories: [
      releasedStory('brand-deals-inbox', 'Featured', 'revenue_activation', 'Review qualified brand deals in your Inbox', 'See the buyer, budget, and source. Approve preparation or pass; Jovie never sends outreach without your approval.', ['JOV-4578']),
      releasedStory('presence-workspace', 'Featured', 'discovery', 'See how visible you are online', 'Presence brings search visibility, answer readiness, audience quality, and monitored pages into one workspace.', ['JOV-4799']),
      releasedStory('mac-recovery', 'Fixed', 'retention_reliability', 'The Mac app recovers from blank screens', 'Blank launches, failed pages, and canceled sign-ins now return to clear recovery actions instead of leaving you stuck.', ['JOV-4539', 'JOV-5086']),
    ],
  };
}
function renderPublication(input: ChangelogEvalInput): string {
  let section = '';
  const lines = [`## [${input.release}] - 2026-08-14`];
  for (const story of input.stories) {
    if (story.section !== section) {
      section = story.section;
      lines.push('', `### ${section}`, '');
    }
    lines.push(`- **${story.headline}:** ${story.summary}`);
  }
  return lines.join('\n');
}
function runEval(input: ChangelogEvalInput) {
  return evaluateChangelog(input, '2026-08-14T00:00:00Z', {
    markdown: renderPublication(input), changelogPath: '/repo/CHANGELOG.md',
    resolveTag: tag => tag === 'v26.8.0' ? 'a94166f4069664e57220f295e4759976a9282863' : undefined,
  });
}
describe('changelog skill eval', () => {
  test('accepts concise, prioritized stories with reciprocal provenance', () => {
    expect(runEval(validInput())).toMatchObject({ passed: true, findings: [] });
  });
  test('squashes equivalent source outcomes into one story', () => {
    const input = validInput();
    const split = structuredClone(input);
    split.sourceItems[2] = { ...split.sourceItems[2], storyId: 'mac-recovery-2' };
    split.stories.push({
      ...split.stories[2],
      id: 'mac-recovery-2',
      sourceIds: ['JOV-5086'],
    });
    split.stories[2] = { ...split.stories[2], sourceIds: ['JOV-4539'] };
    expect(runEval(split).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'missed-squash' })])
    );
  });
  test('rejects false merges across different customer outcomes', () => {
    const input = validInput();
    const merged = structuredClone(input);
    merged.sourceItems[0] = { ...merged.sourceItems[0], storyId: 'mac-recovery' };
    merged.stories.shift();
    merged.stories[1] = {
      ...merged.stories[1],
      sourceIds: ['JOV-4578', 'JOV-4539', 'JOV-5086'],
    };
    expect(runEval(merged).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'false-merge' })])
    );
  });
  test('rejects one canonical group key for different customer dimensions', () => {
    const broken = structuredClone(validInput());
    broken.sourceItems[0] = { ...broken.sourceItems[0], groupKey: 'mac-recovery', storyId: 'mac-recovery' };
    broken.stories.shift();
    broken.stories[1] = { ...broken.stories[1], sourceIds: ['JOV-4578', 'JOV-4539', 'JOV-5086'] };
    expect(runEval(broken).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'false-merge' }),
    ]));
  });
  test('rejects unmapped sources and undocumented exclusions', () => {
    const input = validInput();
    const broken = structuredClone(input);
    broken.sourceItems[0] = { ...broken.sourceItems[0], storyId: undefined };
    broken.sourceItems[4] = {
      ...broken.sourceItems[4],
      exclusionReason: undefined,
    };
    expect(runEval(broken).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'unmapped-public-source' }),
        expect.objectContaining({ rule: 'missing-exclusion-reason' }),
      ])
    );
  });
  test('requires every public source to appear in its mapped story', () => {
    const input = validInput();
    const broken = structuredClone(input);
    broken.stories[2] = { ...broken.stories[2], sourceIds: ['JOV-4539'] };
    expect(runEval(broken).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'source-story-mismatch', sourceId: 'JOV-5086' }),
    ]));
  });
  test('rejects parenthesized pull request IDs in public copy', () => {
    const input = validInput();
    const broken = structuredClone(input);
    broken.stories[0] = {
      ...broken.stories[0],
      summary: 'Review qualified deals with clearer evidence (#123).',
    };
    expect(runEval(broken).findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'pull-request-id' }),
    ]));
  });
  test('rejects weak copy, internal jargon, missing evidence, and bad order', () => {
    const input = validInput();
    const broken = structuredClone(input);
    broken.stories.reverse();
    broken.stories[0] = {
      ...broken.stories[0],
      headline: 'A very long internal JOV-5086 migration headline for users',
      summary:
        'This first sentence contains Redis middleware. This is sentence two. This is sentence three with many unnecessary words for everyone.',
      availabilityEvidence: {
        ...broken.stories[0].availabilityEvidence,
        reference: '',
      },
    };

    const rules = runEval(broken).findings.map(finding => finding.rule);
    expect(rules).toContain('priority-order');
    expect(rules).toContain('headline-length');
    expect(rules).toContain('summary-sentences');
    expect(rules).toContain('ticket-id');
    expect(rules).toContain('implementation-jargon');
    expect(rules).toContain('missing-availability-evidence');
  });
  test('fails closed after the third revision', () => {
    const input = { ...validInput(), iteration: 4 };
    expect(runEval(input).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'iteration-bound' })])
    );
  });
  test('rejects malformed runtime input instead of trusting TypeScript casts', () => {
    const input = structuredClone(validInput()) as unknown as {
      stories: Array<Record<string, unknown>>;
    };
    input.stories[0].priority = 'urgent';
    input.stories[0].section = 'Highlights';
    input.stories[0].sourceIds = 'JOV-4578';

    const rules = runEval(input as unknown as ChangelogEvalInput).findings.map(
      finding => finding.rule
    );
    expect(rules.filter(rule => rule === 'story-contract')).toHaveLength(3);
  });
  test('binds the receipt to the exact published changelog stories', () => {
    const input = validInput();
    const result = evaluateChangelog(input, '2026-08-14T00:00:00Z', {
      markdown: renderPublication(input).replace('buyer, budget', 'buyer and budget'),
      changelogPath: '/repo/CHANGELOG.md',
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'publication-mismatch' }),
      ])
    );
  });
  test('rejects empty inventories and unbound publication inputs', () => {
    const empty = { ...validInput(), sourceItems: [], stories: [] };
    expect(evaluateChangelog(empty).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'empty-source-inventory' }),
        expect.objectContaining({ rule: 'publication-unbound' }),
      ])
    );
  });
  test('returns a failed receipt for malformed source arrays', () => {
    const malformed = {
      ...validInput(),
      sourceItems: [null],
    } as unknown as ChangelogEvalInput;

    expect(runEval(malformed)).toMatchObject({
      passed: false,
      counts: { publicSourceItems: 0, internalSourceItems: 0 },
    });
  });
  test('returns a failed receipt for a non-string release', () => {
    const malformed = { ...validInput(), release: null } as unknown as ChangelogEvalInput;
    expect(runEval(malformed)).toMatchObject({ passed: false });
  });
  test('rejects weak, nonexistent, or mismatched release evidence', () => {
    for (const reference of ['this is not evidence', 'vDOES-NOT-EXIST@0000000000000000000000000000000000000000']) {
      const broken = structuredClone(validInput());
      broken.stories[0].availabilityEvidence.reference = reference;
      expect(runEval(broken).passed).toBe(false);
    }
  });
  test('binds CLI publication to the repository root changelog', () => {
    expect(isCanonicalChangelogPath('/repo/CHANGELOG.md', '/repo')).toBe(true);
    expect(isCanonicalChangelogPath('/tmp/CHANGELOG.md', '/repo')).toBe(false);
  });
});
