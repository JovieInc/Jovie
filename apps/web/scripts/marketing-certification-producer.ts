/**
 * Marketing certification producer (JOV-6928 Canary A).
 *
 * Runs on push to main: selects the marketing registry entries whose canonical
 * source changed (or all of them with --all), gathers machine evidence at the
 * pushed SHA, and posts one `jovie.certification/v1` packet per entry to the
 * evidence ingest route. The store decides state; this script only reports
 * what actually ran. Missing evidence is sent as `missing`, never as passed.
 *
 *   tsx scripts/marketing-certification-producer.ts --sha <sha> --changed <file> [--all] [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import type {
  CertificationEvidenceReceipt,
  CertificationEvidenceStatus,
  CertificationReviewPacket,
  CertificationTasteEvidenceTier,
} from '@/lib/agent-os/certification';
import { JOVIE_CERTIFICATION_CONTRACT } from '@/lib/agent-os/certification';
import {
  MARKETING_COMPONENT_REGISTRY,
  type MarketingRegistryEntry,
  validateMarketingPenRegistry,
} from '../data/marketing/componentRegistry';

const WEB_ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
/** Registry sources are repo-relative; vitest runs from apps/web. */
const webRelative = (repoPath: string) => repoPath.replace(/^apps\/web\//u, '');
const INGEST_PATH = '/api/internal/ovie/certification-evidence';
const INVARIANT_SUITES = [
  'tests/unit/marketing/component-registry.test.ts',
  'tests/unit/marketing/landing-page-grammar.test.ts',
  'tests/unit/marketing/recipe-manifest.test.ts',
];

interface VitestJson {
  readonly testResults: readonly {
    readonly name: string;
    readonly status: string;
    readonly assertionResults: readonly {
      readonly title: string;
      readonly status: string;
    }[];
  }[];
}

/** Runs vitest and returns its JSON report; a failing run still reports. */
export function runVitest(args: readonly string[]): VitestJson | null {
  const out = join(mkdtempSync(join(tmpdir(), 'jovie-mcp-')), 'report.json');
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        ...args,
        '--reporter=json',
        `--outputFile=${out}`,
      ],
      {
        cwd: WEB_ROOT,
        stdio: 'inherit',
      }
    );
  } catch {
    // Non-zero exit = failed tests; the JSON report carries the detail.
  }
  return existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as VitestJson)
    : null;
}

/** Entries whose canonical source is among the changed repo paths. */
export function affectedEntries(
  entries: readonly MarketingRegistryEntry[],
  changedRepoPaths: readonly string[]
): MarketingRegistryEntry[] {
  const changed = new Set(changedRepoPaths);
  return entries.filter(
    entry => entry.resolvedSource && changed.has(entry.resolvedSource)
  );
}

function listStoryFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(path).isDirectory()) listStoryFiles(path, found);
    else if (name.endsWith('.stories.tsx')) found.push(path);
  }
  return found;
}

/**
 * Storybook composes a sidebar path from the meta title plus the story name,
 * so `Marketing/Shells/PublicPageShell` is meta `Marketing/Shells` + story
 * `PublicPageShell`. Returns the file whose meta title owns the entry.
 */
export function storyFileFor(
  storybookTitle: string,
  files: readonly { readonly path: string; readonly title: string }[]
): { readonly path: string; readonly storyName: string } | null {
  const exact = files.find(file => file.title === storybookTitle);
  if (exact) return { path: exact.path, storyName: '' };
  const parent = files.find(file => file.title === dirname(storybookTitle));
  return parent
    ? { path: parent.path, storyName: basename(storybookTitle) }
    : null;
}

function receipt(
  entry: MarketingRegistryEntry,
  tier: CertificationTasteEvidenceTier,
  status: CertificationEvidenceStatus,
  sha: string,
  ref: string,
  summary: string,
  evidence: unknown
): CertificationEvidenceReceipt {
  return {
    id: `${entry.id}:${tier}`,
    tier,
    status,
    sourceSha: sha,
    ref,
    // The kernel requires a content digest: bind the receipt to the exact
    // evidence it reports. Missing evidence has nothing to digest.
    digest: status === 'missing' ? null : digestOf(evidence),
    summary,
  };
}

function digestOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function vitestEvidence(
  report: VitestJson | null,
  file: string,
  storyName?: string
): { status: CertificationEvidenceStatus; evidence: unknown } {
  const result = report?.testResults.find(item => item.name.endsWith(file));
  const assertions = !result
    ? []
    : storyName
      ? result.assertionResults.filter(item => item.title === storyName)
      : result.assertionResults;
  if (assertions.length === 0) return { status: 'missing', evidence: null };
  return {
    status: assertions.every(item => item.status === 'passed')
      ? 'passed'
      : 'failed',
    evidence: { file, assertions },
  };
}

export function buildPacket(input: {
  readonly entry: MarketingRegistryEntry;
  readonly sha: string;
  readonly runRef: string;
  readonly penIssueIds: ReadonlySet<string>;
  readonly invariants: VitestJson | null;
  readonly ownTests: VitestJson | null;
  readonly ownTestFile: string | null;
  readonly stories: VitestJson | null;
  readonly story: { readonly path: string; readonly storyName: string } | null;
  readonly sourceDigest: string | null;
}): CertificationReviewPacket {
  const { entry, sha, runRef } = input;
  const penOk =
    entry.penRootIds.length > 0 &&
    entry.rootProofs.length > 0 &&
    !input.penIssueIds.has(entry.id);
  const invariantResults = INVARIANT_SUITES.map(suite =>
    vitestEvidence(input.invariants, suite)
  );
  const invariantStatuses = invariantResults.map(result => result.status);
  const invariantStatus: CertificationEvidenceStatus = invariantStatuses.every(
    s => s === 'passed'
  )
    ? 'passed'
    : invariantStatuses.includes('failed')
      ? 'failed'
      : 'missing';
  const tests = input.ownTestFile
    ? vitestEvidence(input.ownTests, input.ownTestFile)
    : { status: 'missing' as const, evidence: null };
  const visual = input.story
    ? vitestEvidence(
        input.stories,
        input.story.path,
        input.story.storyName || undefined
      )
    : { status: 'missing' as const, evidence: null };
  const testsStatus = tests.status;
  const visualStatus = visual.status;

  return {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    subject: {
      id: entry.id,
      kind: `marketing-${entry.kind}`,
      title: entry.storybookTitle,
    },
    source: entry.resolvedSource
      ? {
          repository: 'JovieInc/Jovie',
          ref: 'main',
          sha,
          paths: [entry.resolvedSource],
          digest: input.sourceDigest,
        }
      : null,
    canonicalReferences: [
      receipt(
        entry,
        'canonical_references',
        penOk ? 'passed' : 'failed',
        sha,
        'apps/web/data/marketing/componentRegistry.ts',
        penOk
          ? `Pen roots ${entry.penRootIds.join(', ')} resolve with ${entry.rootProofs.length} source proof(s).`
          : 'Pen identity unresolved or flagged by validateMarketingPenRegistry.',
        { penRootIds: entry.penRootIds, rootProofs: entry.rootProofs }
      ),
    ],
    invariantEvaluation: [
      receipt(
        entry,
        'invariant_evaluation',
        invariantStatus,
        sha,
        runRef,
        `Marketing registry, grammar and recipe invariants: ${invariantStatus}.`,
        invariantResults
      ),
    ],
    testsCoverage: [
      receipt(
        entry,
        'tests_coverage',
        testsStatus,
        sha,
        runRef,
        input.ownTestFile
          ? `${input.ownTestFile}: ${testsStatus}.`
          : 'No sibling unit test for the canonical source.',
        tests.evidence
      ),
    ],
    visualProof: [
      receipt(
        entry,
        'visual_proof',
        visualStatus,
        sha,
        runRef,
        input.story
          ? `Storybook browser render of ${entry.storybookTitle}: ${visualStatus}. Render proof, not pixel comparison.`
          : `No story resolves ${entry.storybookTitle}.`,
        visual.evidence
      ),
    ],
    requiredVariants: [],
    itemMedia: [],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      sha: { type: 'string' },
      changed: { type: 'string' },
      all: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      'base-url': { type: 'string', default: 'https://jov.ie' },
      'run-ref': { type: 'string', default: 'local' },
    },
  });
  const sha = values.sha ?? '';
  if (!/^[0-9a-f]{40}$/u.test(sha))
    throw new Error('--sha must be a full 40-hex commit');
  const changed = values.changed
    ? readFileSync(values.changed, 'utf8').split('\n').filter(Boolean)
    : [];
  const entries = values.all
    ? MARKETING_COMPONENT_REGISTRY.filter(entry => entry.resolvedSource)
    : affectedEntries(MARKETING_COMPONENT_REGISTRY, changed);
  if (entries.length === 0) {
    console.log('[marketing-cert] no registry entry affected');
    return;
  }

  const storyFiles = listStoryFiles(join(WEB_ROOT, 'components')).map(path => ({
    path: relative(WEB_ROOT, path),
    title: /title:\s*'([^']+)'/u.exec(readFileSync(path, 'utf8'))?.[1] ?? '',
  }));
  const plan = entries.map(entry => {
    const ownTest =
      entry.resolvedSource?.replace(/\.tsx?$/u, '.test.tsx') ?? null;
    return {
      entry,
      story: storyFileFor(entry.storybookTitle, storyFiles),
      ownTestFile:
        ownTest && existsSync(join(REPO_ROOT, ownTest))
          ? webRelative(ownTest)
          : null,
    };
  });

  const penIssueIds = new Set(
    validateMarketingPenRegistry().map(issue => issue.id)
  );
  const invariants = runVitest(INVARIANT_SUITES);
  const ownTestFiles = [
    ...new Set(
      plan.flatMap(item => (item.ownTestFile ? [item.ownTestFile] : []))
    ),
  ];
  const ownTests = ownTestFiles.length > 0 ? runVitest(ownTestFiles) : null;
  const storyPaths = [
    ...new Set(plan.flatMap(item => (item.story ? [item.story.path] : []))),
  ];
  const stories =
    storyPaths.length > 0
      ? runVitest(['--config=vitest.config.storybook.mts', ...storyPaths])
      : null;

  const secret = process.env.CRON_SECRET;
  let failures = 0;
  for (const item of plan) {
    const sourcePath = item.entry.resolvedSource
      ? join(REPO_ROOT, item.entry.resolvedSource)
      : null;
    const packet = buildPacket({
      ...item,
      sha,
      runRef: values['run-ref'] ?? 'local',
      penIssueIds,
      invariants,
      ownTests,
      stories,
      sourceDigest:
        sourcePath && existsSync(sourcePath)
          ? createHash('sha256').update(readFileSync(sourcePath)).digest('hex')
          : null,
    });
    const tiers = [
      packet.canonicalReferences,
      packet.invariantEvaluation,
      packet.testsCoverage,
      packet.visualProof,
    ]
      .map(group => `${group[0].tier}=${group[0].status}`)
      .join(' ');
    console.log(`[marketing-cert] ${item.entry.id} ${tiers}`);
    if (values['dry-run']) continue;
    if (!secret) throw new Error('CRON_SECRET is required to post evidence');
    const response = await fetch(new URL(INGEST_PATH, values['base-url']), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ evaluatedAt: new Date().toISOString(), packet }),
    });
    const body = await response.text();
    console.log(
      `[marketing-cert] ${item.entry.id} -> ${response.status} ${body.slice(0, 300)}`
    );
    if (!response.ok) failures += 1;
  }
  if (failures > 0) process.exit(1);
}

if (
  process.argv[1] &&
  process.argv[1].endsWith('marketing-certification-producer.ts')
) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
