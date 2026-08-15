#!/usr/bin/env bun
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
export const CHANGELOG_EVAL_SCHEMA = 'gstack-changelog-eval/v1';
export const CHANGELOG_EVAL_MAX_ITERATIONS = 3;
export const PRIORITY_ORDER = ['revenue_activation', 'retention_reliability', 'discovery', 'polish'] as const;
const CHANGELOG_SECTIONS = ['Featured', 'Added', 'Changed', 'Fixed', 'Removed'] as const;
export type ChangelogPriority = (typeof PRIORITY_ORDER)[number];
export interface ChangelogSourceItem {
  readonly id: string;
  readonly groupKey: string;
  readonly audience: string;
  readonly availability: string;
  readonly action: string;
  readonly outcome: string;
  readonly disposition: 'public' | 'internal';
  readonly storyId?: string;
  readonly exclusionReason?: string;
}
export interface ChangelogStory {
  readonly id: string;
  readonly section: 'Featured' | 'Added' | 'Changed' | 'Fixed' | 'Removed';
  readonly priority: ChangelogPriority;
  readonly headline: string;
  readonly summary: string;
  readonly sourceIds: readonly string[];
  readonly availabilityEvidence: {
    readonly status: 'released' | 'unreleased';
    readonly release: string;
    readonly type: 'git_tag' | 'publication';
    readonly reference: string;
  };
}
export interface ChangelogEvalInput {
  readonly schema: typeof CHANGELOG_EVAL_SCHEMA;
  readonly release: string;
  readonly iteration: number;
  readonly sourceItems: readonly ChangelogSourceItem[];
  readonly stories: readonly ChangelogStory[];
}
export interface ChangelogEvalFinding {
  readonly rule: string;
  readonly message: string;
  readonly storyId?: string;
  readonly sourceId?: string;
}
export interface ChangelogEvalResult {
  readonly schema: typeof CHANGELOG_EVAL_SCHEMA;
  readonly release: string;
  readonly iteration: number;
  readonly passed: boolean;
  readonly evaluatedAt: string;
  readonly publication?: {
    readonly changelogPath: string;
    readonly sha256: string;
  };
  readonly findings: readonly ChangelogEvalFinding[];
  readonly counts: {
    readonly sourceItems: number;
    readonly publicSourceItems: number;
    readonly internalSourceItems: number;
    readonly stories: number;
  };
}
const FORBIDDEN_COPY = [
  { rule: 'ticket-id', pattern: /\b(?:JOV|GH)-?\d+\b/i },
  { rule: 'pull-request-id', pattern: /(?:^|[\s([])#\d+\b/ },
  {
    rule: 'implementation-jargon',
    pattern:
      /\b(?:idempoten(?:t|cy)|hydrate(?:d|s|ion)?|compare-and-set|CAS|middleware|migration|webhook|SDK|CI|E2E|Redis|Vercel|Clerk|Sentry|Biome|Drizzle|Playwright|Vitest)\b/i,
  },
] as const;
function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ').toLowerCase();
}
function addInputContractFindings(
  input: ChangelogEvalInput,
  findings: ChangelogEvalFinding[]
): void {
  for (const [index, source] of input.sourceItems.entries()) {
    const prefix = `Source item ${index + 1}`;
    for (const field of [
      'id',
      'groupKey',
      'audience',
      'availability',
      'action',
      'outcome',
    ] as const) {
      if (typeof source?.[field] !== 'string' || !source[field].trim()) {
        findings.push({
          rule: 'source-contract',
          message: `${prefix} needs a non-empty ${field}.`,
        });
      }
    }
    if (source?.disposition !== 'public' && source?.disposition !== 'internal') {
      findings.push({
        rule: 'source-contract',
        message: `${prefix} has an invalid disposition.`,
      });
    }
  }
  for (const [index, story] of input.stories.entries()) {
    const prefix = `Story ${index + 1}`;
    for (const field of ['id', 'headline', 'summary'] as const) {
      if (typeof story?.[field] !== 'string' || !story[field].trim()) {
        findings.push({
          rule: 'story-contract',
          message: `${prefix} needs a non-empty ${field}.`,
        });
      }
    }
    if (
      !story?.availabilityEvidence ||
      typeof story.availabilityEvidence !== 'object' ||
      typeof story.availabilityEvidence.release !== 'string' ||
      typeof story.availabilityEvidence.reference !== 'string' ||
      !['git_tag', 'publication'].includes(story.availabilityEvidence.type) ||
      !['released', 'unreleased'].includes(story.availabilityEvidence.status)
    ) {
      findings.push({
        rule: 'story-contract',
        message: `${prefix} needs structured availability evidence.`,
      });
    }
    if (!CHANGELOG_SECTIONS.includes(story?.section)) {
      findings.push({
        rule: 'story-contract',
        message: `${prefix} has an invalid section.`,
      });
    }
    if (!PRIORITY_ORDER.includes(story?.priority)) {
      findings.push({
        rule: 'story-contract',
        message: `${prefix} has an invalid priority.`,
      });
    }
    if (!Array.isArray(story?.sourceIds)) {
      findings.push({
        rule: 'story-contract',
        message: `${prefix} needs a sourceIds array.`,
      });
    }
  }
}
function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
function sentenceCount(value: string): number {
  return value
    .trim()
    .split(/[.!?]+(?:\s+|$)/)
    .filter(part => part.trim().length > 0).length;
}
function addCopyFindings(
  story: ChangelogStory,
  findings: ChangelogEvalFinding[]
): void {
  if (wordCount(story.headline) > 8) {
    findings.push({
      rule: 'headline-length',
      storyId: story.id,
      message: `Headline has ${wordCount(story.headline)} words; maximum is 8.`,
    });
  }
  if (wordCount(story.summary) > 22) {
    findings.push({
      rule: 'summary-length',
      storyId: story.id,
      message: `Summary has ${wordCount(story.summary)} words; maximum is 22.`,
    });
  }
  if (sentenceCount(story.summary) > 2) {
    findings.push({
      rule: 'summary-sentences',
      storyId: story.id,
      message: 'Summary has more than 2 sentences.',
    });
  }
  const publicCopy = `${story.headline} ${story.summary}`;
  for (const forbidden of FORBIDDEN_COPY) {
    if (forbidden.pattern.test(publicCopy)) {
      findings.push({
        rule: forbidden.rule,
        storyId: story.id,
        message: `Public copy contains forbidden internal language: ${forbidden.rule}.`,
      });
    }
  }
}
function addSourceMappingFindings(
  input: ChangelogEvalInput,
  findings: ChangelogEvalFinding[]
): void {
  const stories = new Map(input.stories.map(story => [story.id, story]));
  const sourceIds = new Set<string>();
  for (const source of input.sourceItems) {
    if (sourceIds.has(source.id)) {
      findings.push({
        rule: 'duplicate-source-id',
        sourceId: source.id,
        message: `Source item ${source.id} appears more than once.`,
      });
    }
    sourceIds.add(source.id);
    if (source.disposition === 'public') {
      if (!source.storyId || !stories.has(source.storyId)) {
        findings.push({
          rule: 'unmapped-public-source',
          sourceId: source.id,
          message: `Public source ${source.id} does not map to a story.`,
        });
      } else if (!stories.get(source.storyId)?.sourceIds.includes(source.id)) {
        findings.push({
          rule: 'source-story-mismatch',
          sourceId: source.id,
          storyId: source.storyId,
          message: `Public source ${source.id} is missing from story ${source.storyId}.`,
        });
      }
      if (source.exclusionReason) {
        findings.push({
          rule: 'contradictory-disposition',
          sourceId: source.id,
          message: `Public source ${source.id} also has an exclusion reason.`,
        });
      }
    } else if (!source.exclusionReason?.trim()) {
      findings.push({
        rule: 'missing-exclusion-reason',
        sourceId: source.id,
        message: `Internal source ${source.id} needs an exclusion reason.`,
      });
    }
  }
  for (const story of input.stories) {
    const uniqueSourceIds = new Set(story.sourceIds);
    if (story.sourceIds.length === 0) {
      findings.push({
        rule: 'story-without-source',
        storyId: story.id,
        message: `Story ${story.id} has no source items.`,
      });
    }
    if (uniqueSourceIds.size !== story.sourceIds.length) {
      findings.push({
        rule: 'duplicate-story-source',
        storyId: story.id,
        message: `Story ${story.id} repeats a source item.`,
      });
    }
    for (const sourceId of story.sourceIds) {
      const source = input.sourceItems.find(item => item.id === sourceId);
      if (!source || source.disposition !== 'public' || source.storyId !== story.id) {
        findings.push({
          rule: 'story-source-mismatch',
          storyId: story.id,
          sourceId,
          message: `Story ${story.id} does not have a reciprocal public mapping for ${sourceId}.`,
        });
      }
    }
  }
}
function addGroupingFindings(
  input: ChangelogEvalInput,
  findings: ChangelogEvalFinding[]
): void {
  const publicSources = input.sourceItems.filter(
    source => source.disposition === 'public' && source.storyId
  );
  const storyToKeys = new Map<string, Set<string>>();
  const keyToStories = new Map<string, Set<string>>();
  const keyToDimensions = new Map<string, Set<string>>();
  for (const source of publicSources) {
    const key = normalize(source.groupKey);
    const dimensions = [source.audience, source.availability, source.action, source.outcome]
      .map(normalize).join('\u001f');
    const storyKeys = storyToKeys.get(source.storyId!) ?? new Set<string>();
    storyKeys.add(key);
    storyToKeys.set(source.storyId!, storyKeys);
    const stories = keyToStories.get(key) ?? new Set<string>();
    stories.add(source.storyId!);
    keyToStories.set(key, stories);
    const groupedDimensions = keyToDimensions.get(key) ?? new Set<string>();
    groupedDimensions.add(dimensions);
    keyToDimensions.set(key, groupedDimensions);
  }
  for (const [key, dimensions] of keyToDimensions) {
    if (dimensions.size > 1) {
      findings.push({
        rule: 'false-merge', message: `Canonical group ${key} contains different customer dimensions.`,
      });
    }
  }
  for (const [storyId, keys] of storyToKeys) {
    if (keys.size > 1) {
      findings.push({
        rule: 'false-merge',
        storyId,
        message: `Story ${storyId} merges sources with different audience, availability, action, or outcome.`,
      });
    }
  }
  for (const stories of keyToStories.values()) {
    if (stories.size > 1) {
      findings.push({
        rule: 'missed-squash',
        message: `Equivalent customer outcomes are split across stories: ${[...stories].join(', ')}.`,
      });
    }
  }
}
function addStoryFindings(
  input: ChangelogEvalInput,
  findings: ChangelogEvalFinding[],
  resolveTag?: (tag: string) => string | undefined
): void {
  const storyIds = new Set<string>();
  const previousPriorityBySection = new Map<ChangelogStory['section'], number>();
  for (const story of input.stories) {
    if (storyIds.has(story.id)) {
      findings.push({
        rule: 'duplicate-story-id',
        storyId: story.id,
        message: `Story ${story.id} appears more than once.`,
      });
    }
    storyIds.add(story.id);
    const priority = PRIORITY_ORDER.indexOf(story.priority);
    const previousPriority = previousPriorityBySection.get(story.section) ?? -1;
    if (priority < previousPriority) {
      findings.push({
        rule: 'priority-order',
        storyId: story.id,
        message: `Story ${story.id} is out of priority order.`,
      });
    }
    previousPriorityBySection.set(
      story.section,
      Math.max(previousPriority, priority)
    );
    const evidence = story.availabilityEvidence;
    const expectedStatus =
      input.release.toLowerCase() === 'unreleased' ? 'unreleased' : 'released';
    const tag = /^v([^@\s]+)@([0-9a-f]{40})$/.exec(evidence.reference);
    const validReference = evidence.type === 'git_tag'
      ? tag?.[1] === input.release && resolveTag?.(`v${tag[1]}`) === tag[2]
      : evidence.reference === `CHANGELOG.md#${input.release}`;
    if (
      !validReference ||
      (expectedStatus === 'released' && evidence.type !== 'git_tag') ||
      (expectedStatus === 'unreleased' && evidence.type !== 'publication') ||
      evidence.release !== input.release ||
      evidence.status !== expectedStatus
    ) {
      findings.push({
        rule: 'missing-availability-evidence',
        storyId: story.id,
        message: `Story ${story.id} lacks exact ${input.release} availability evidence.`,
      });
    }
    addCopyFindings(story, findings);
  }
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function publishedStories(markdown: string, release: string): string[] {
  const lines = markdown.split('\n');
  const heading = new RegExp(`^## \\[${escapeRegExp(release)}\\](?:\\s|$)`);
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) return [];
  const stories: string[] = [];
  let section = '';
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## [')) break;
    const sectionMatch = /^### (Featured|Added|Changed|Fixed|Removed)$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const trimmed = line.trim();
    if (
      section &&
      trimmed.startsWith('- ') &&
      !/\[\s*internal\s*\]/i.test(trimmed)
    ) {
      stories.push(`${section}\u001f${trimmed.slice(2)}`);
    }
  }
  return stories;
}
function addPublicationFindings(
  input: ChangelogEvalInput,
  markdown: string | undefined,
  findings: ChangelogEvalFinding[]
): void {
  if (markdown === undefined) {
    findings.push({ rule: 'publication-unbound', message: 'The eval must read the exact CHANGELOG.md being published.' });
    return;
  }
  const expected = input.stories.map(
    story => `${story.section}\u001f**${story.headline}:** ${story.summary}`
  );
  if (JSON.stringify(publishedStories(markdown, input.release)) !== JSON.stringify(expected)) {
    findings.push({ rule: 'publication-mismatch', message: `Published ${input.release} stories do not match the evaluated stories.` });
  }
}
export function evaluateChangelog(
  input: ChangelogEvalInput,
  evaluatedAt = new Date().toISOString(),
  publication?: {
    readonly markdown: string;
    readonly changelogPath: string;
    readonly resolveTag?: (tag: string) => string | undefined;
  }
): ChangelogEvalResult {
  const findings: ChangelogEvalFinding[] = [];
  const sourceItems = Array.isArray(input?.sourceItems) ? input.sourceItems : [];
  const stories = Array.isArray(input?.stories) ? input.stories : [];
  const safeInput = { ...input, sourceItems, stories };
  if (safeInput.schema !== CHANGELOG_EVAL_SCHEMA) {
    findings.push({
      rule: 'schema',
      message: `Expected schema ${CHANGELOG_EVAL_SCHEMA}.`,
    });
  }
  if (
    !Number.isInteger(safeInput.iteration) ||
    safeInput.iteration < 1 ||
    safeInput.iteration > CHANGELOG_EVAL_MAX_ITERATIONS
  ) {
    findings.push({
      rule: 'iteration-bound',
      message: `Iteration must be between 1 and ${CHANGELOG_EVAL_MAX_ITERATIONS}.`,
    });
  }
  if (typeof safeInput.release !== 'string' || !safeInput.release.trim()) {
    findings.push({ rule: 'release-contract', message: 'Release identifier is required.' });
  }
  if (sourceItems.length === 0) {
    findings.push({ rule: 'empty-source-inventory', message: 'The source inventory cannot be empty.' });
  }
  addInputContractFindings(safeInput, findings);
  if (!findings.some(finding => finding.rule.endsWith('-contract'))) {
    addSourceMappingFindings(safeInput, findings);
    addGroupingFindings(safeInput, findings);
    addStoryFindings(safeInput, findings, publication?.resolveTag);
    addPublicationFindings(safeInput, publication?.markdown, findings);
  }
  return {
    schema: CHANGELOG_EVAL_SCHEMA,
    release: typeof safeInput.release === 'string' ? safeInput.release : '',
    iteration: Number.isInteger(safeInput.iteration) ? safeInput.iteration : 0,
    passed: findings.length === 0,
    evaluatedAt,
    publication: publication
      ? {
          changelogPath: publication.changelogPath,
          sha256: createHash('sha256').update(publication.markdown).digest('hex'),
        }
      : undefined,
    findings,
    counts: {
      sourceItems: sourceItems.length,
      publicSourceItems: sourceItems.filter(
        source => source?.disposition === 'public'
      ).length,
      internalSourceItems: sourceItems.filter(
        source => source?.disposition === 'internal'
      ).length,
      stories: stories.length,
    },
  };
}
function parseArgs(args: readonly string[]): {
  inputPath: string;
  changelogPath: string;
  receiptPath?: string;
} {
  const [inputPath, ...rest] = args;
  if (!inputPath) {
    throw new Error(
      'Usage: bun run scripts/changelog-eval.ts <input.json> --changelog <CHANGELOG.md> [--receipt <result.json>]'
    );
  }
  const receiptIndex = rest.indexOf('--receipt');
  const changelogIndex = rest.indexOf('--changelog');
  if (changelogIndex === -1 || !rest[changelogIndex + 1]) {
    throw new Error('--changelog <CHANGELOG.md> is required.');
  }
  return {
    inputPath,
    changelogPath: rest[changelogIndex + 1],
    receiptPath: receiptIndex === -1 ? undefined : rest[receiptIndex + 1],
  };
}
export function isCanonicalChangelogPath(changelogPath: string, repoRoot: string): boolean {
  return path.resolve(changelogPath) === path.join(path.resolve(repoRoot), 'CHANGELOG.md');
}
function runCli(): void {
  const { inputPath, changelogPath, receiptPath } = parseArgs(
    process.argv.slice(2)
  );
  const input = JSON.parse(
    fs.readFileSync(path.resolve(inputPath), 'utf8')
  ) as ChangelogEvalInput;
  const resolvedChangelog = path.resolve(changelogPath);
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (!isCanonicalChangelogPath(resolvedChangelog, repoRoot)) {
    throw new Error('--changelog must resolve to the repository root CHANGELOG.md.');
  }
  const result = evaluateChangelog(input, new Date().toISOString(), {
    markdown: fs.readFileSync(resolvedChangelog, 'utf8'),
    changelogPath: resolvedChangelog,
    resolveTag: tag => {
      try { return execFileSync('git', ['rev-parse', `refs/tags/${tag}^{commit}`], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch { return undefined; }
    },
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (receiptPath) {
    const resolvedReceipt = path.resolve(receiptPath);
    fs.mkdirSync(path.dirname(resolvedReceipt), { recursive: true });
    fs.writeFileSync(resolvedReceipt, serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (!result.passed) process.exitCode = 1;
}
if (import.meta.main) runCli();
