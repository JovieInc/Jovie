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
import { basename, dirname, join, matchesGlob, relative } from 'node:path';
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

/**
 * Input envelope shared with the hosted trigger (parity-tested). Runtime
 * dependencies are deliberately conservative: the component registry is not an
 * import graph, so a changed shared input must never leave a green certificate
 * stale. This runs after main, not in the source PR or merge-queue gate.
 * Authenticated routes and API implementations are outside this marketing
 * render envelope; shared libraries/components remain inside it.
 */
export const CERTIFICATION_INPUT_GLOBS = [
  'apps/web/components/**',
  'apps/web/data/**',
  'apps/web/styles/**',
  'apps/web/lib/**',
  'apps/web/hooks/**',
  'apps/web/constants/**',
  'apps/web/public/**',
  'apps/web/app/(home)/**',
  'apps/web/app/(marketing)/**',
  'apps/web/app/*.*',
  'apps/web/tests/**',
  'apps/web/scripts/marketing-certification-producer*',
  'apps/web/*.config.*',
  'apps/web/tsconfig*.json',
  'apps/web/package.json',
  'apps/web/.storybook/**',
  'packages/ui/**',
  'packages/copy/**',
  'canon/invariants.jsonl',
  'docs/marketing/**',
  'docs/design-system/molecule-ownership-receipt.json',
  'scripts/agent/pen-workspace-locks.json',
  '.github/actions/setup-node-pnpm/**',
  '.nvmrc',
  '.node-version',
  'scripts/invariants/**',
  'design.tokens.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/workflows/marketing-certification-producer.yml',
] as const;

const isTestOrStory = (path: string) =>
  /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u.test(path);

/** Unmapped test changes are conservative only inside the marketing domain. */
export function requiresFullRecertification(path: string): boolean {
  if (!CERTIFICATION_INPUT_GLOBS.some(glob => matchesGlob(path, glob)))
    return false;
  if (
    path.startsWith('apps/web/scripts/marketing-certification-producer') ||
    path.startsWith('scripts/invariants/')
  )
    return true;
  if (isTestOrStory(path)) return false;
  // Shared setup, fixtures and helpers can change every test's meaning.
  return true;
}

export interface CertificationSelection<T> {
  readonly plans: T[];
  readonly reason:
    | 'explicit-all'
    | 'shared-input'
    | 'direct-dependency'
    | 'unaffected';
  readonly invalidatedBy: readonly string[];
}

/** Inspect the entire push: a direct hit must not hide a later shared input. */
export function selectCertificationPlans<
  T extends { readonly dependencies: readonly string[] },
>(
  plans: readonly T[],
  changed: readonly string[],
  all: boolean
): CertificationSelection<T> {
  if (all)
    return { plans: [...plans], reason: 'explicit-all', invalidatedBy: [] };
  const shared = changed.filter(
    path =>
      requiresFullRecertification(path) ||
      INVARIANT_SUITES.some(suite => path === `apps/web/${suite}`) ||
      (isTestOrStory(path) &&
        /^apps\/web\/(?:tests\/(?:unit\/(?:marketing|home)\/|product-screenshots\/|visual-qa\/)|components\/|data\/marketing\/)/u.test(
          path
        ) &&
        !plans.some(plan => plan.dependencies.includes(path)))
  );
  if (shared.length > 0)
    return { plans: [...plans], reason: 'shared-input', invalidatedBy: shared };
  const selected = affectedEntries(plans, changed);
  return {
    plans: selected,
    reason: selected.length > 0 ? 'direct-dependency' : 'unaffected',
    invalidatedBy: changed.filter(path =>
      selected.some(plan => plan.dependencies.includes(path))
    ),
  };
}

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

/**
 * An entry's evidence depends on its canonical source, its declared tests and
 * its story. A change to any of them invalidates the certificate, so all of
 * them select the entry for re-evaluation (repo-relative paths).
 */
export function affectedEntries<
  T extends { readonly dependencies: readonly string[] },
>(plans: readonly T[], changedRepoPaths: readonly string[]): T[] {
  const changed = new Set(changedRepoPaths);
  return plans.filter(plan =>
    plan.dependencies.some(path => changed.has(path))
  );
}

/**
 * Tests that certify an entry: its sibling `.test.tsx` and every existing
 * `@coverage-via <path>` target the source declares (the convention the
 * component ship gate already honors). Repo-relative.
 */
export function testFilesFor(
  resolvedSource: string,
  source: string,
  exists: (repoPath: string) => boolean
): string[] {
  const sibling = resolvedSource.replace(/\.tsx?$/u, '.test.tsx');
  const declared = declaredTestFiles(source);
  return [...new Set([sibling, ...declared])].filter(
    path => path.length > 0 && exists(path)
  );
}

function declaredTestFiles(source: string): string[] {
  return [...source.matchAll(/@coverage-via\s+(\S+)/gu)]
    .map(match => match[1] ?? '')
    .filter(Boolean);
}

interface CertificationPlanItem {
  readonly entry: MarketingRegistryEntry;
  readonly story: { readonly path: string; readonly storyName: string } | null;
  readonly ownTestFiles: readonly string[];
  readonly dependencies: readonly string[];
}

/**
 * Resolves each source-backed entry's certifying tests, story and dependency
 * set, then selects the entries to re-certify: all of them under `--all`,
 * otherwise only those a changed repo path invalidates.
 */
export function certificationPlans(input: {
  readonly entries: readonly MarketingRegistryEntry[];
  readonly storyFiles: readonly {
    readonly path: string;
    readonly title: string;
  }[];
  readonly all: boolean;
  readonly changed: readonly string[];
  readonly exists: (repoPath: string) => boolean;
  readonly readSource: (repoPath: string) => string | null;
}): CertificationPlanItem[] {
  const plans = input.entries.flatMap(entry => {
    if (!entry.resolvedSource) return [];
    const source = input.readSource(entry.resolvedSource) ?? '';
    const sibling = entry.resolvedSource.replace(/\.tsx?$/u, '.test.tsx');
    const tests = [
      ...new Set([
        ...testFilesFor(entry.resolvedSource, source, input.exists),
        // Keep declared missing/deleted tests: their evidence must stay missing,
        // never silently disappear from a surviving test's passing packet.
        ...declaredTestFiles(source),
        ...(input.changed.includes(sibling) && !input.exists(sibling)
          ? [sibling]
          : []),
      ]),
    ];
    const story = storyFileFor(entry.storybookTitle, input.storyFiles);
    return [
      {
        entry,
        story,
        ownTestFiles: tests.map(webRelative),
        dependencies: [
          entry.resolvedSource,
          sibling,
          ...tests,
          ...(story ? [`apps/web/${story.path}`] : []),
        ],
      },
    ];
  });
  return selectCertificationPlans(plans, input.changed, input.all).plans;
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
  readonly ownTestFiles: readonly string[];
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
  const testResults = input.ownTestFiles.map(file =>
    vitestEvidence(input.ownTests, file)
  );
  const tests: { status: CertificationEvidenceStatus; evidence: unknown } =
    testResults.length === 0 || testResults.some(r => r.status === 'missing')
      ? {
          status: testResults.some(r => r.status === 'failed')
            ? 'failed'
            : 'missing',
          evidence: null,
        }
      : {
          status: testResults.every(r => r.status === 'passed')
            ? 'passed'
            : 'failed',
          evidence: testResults.map(r => r.evidence),
        };
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
        input.ownTestFiles.length > 0
          ? `${input.ownTestFiles.join(', ')}: ${testsStatus}.`
          : 'No sibling or @coverage-via unit test for the canonical source.',
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

/**
 * Real defects only: a `failed` receipt means the evidence ran and found a
 * problem. `missing` is registry state (not yet certifiable), never an issue.
 * One fingerprint per entry+tier, so repeated observations update one issue.
 */
export function defectReceipts(packet: CertificationReviewPacket) {
  return [
    ...packet.canonicalReferences,
    ...packet.invariantEvaluation,
    ...packet.testsCoverage,
    ...packet.visualProof,
  ]
    .filter(receipt => receipt.status === 'failed')
    .map(receipt => ({
      fingerprint: `marketing-cert:${packet.subject.id}:${receipt.tier}`,
      tier: receipt.tier,
      summary: receipt.summary,
      ref: receipt.ref,
    }));
}

type UpsertIssue = (input: {
  fingerprint: string;
  title: string;
  description: string;
  priority: number;
  reopenTerminal?: boolean;
}) => Promise<{ ok: boolean; action?: string; reason?: string }>;

async function linearUpsert(): Promise<UpsertIssue> {
  const { upsertLinearIssueByTitleFingerprint } = await import(
    '../../../scripts/lib/linear-issue-intake.mjs'
  );
  return upsertLinearIssueByTitleFingerprint as UpsertIssue;
}

export async function fileDefects(
  packet: CertificationReviewPacket,
  sha: string,
  loadUpsert: () => Promise<UpsertIssue> = linearUpsert
): Promise<number> {
  const defects = defectReceipts(packet);
  if (defects.length === 0 || !process.env.LINEAR_API_KEY) return 0;
  const upsertLinearIssueByTitleFingerprint = await loadUpsert();
  for (const defect of defects) {
    const result = await upsertLinearIssueByTitleFingerprint({
      fingerprint: defect.fingerprint,
      title: `Certification defect: ${packet.subject.id} ${defect.tier} (${defect.fingerprint})`,
      description: [
        '## Source',
        '- Workflow: marketing-certification-producer.yml (JOV-6928)',
        `- Subject: ${packet.subject.id} (${packet.subject.title})`,
        `- Source SHA: ${sha}`,
        `- Evidence: ${defect.ref}`,
        '',
        '## Failure',
        defect.summary,
        '',
        '## Acceptance',
        'Fix the defect on main; the next push that touches the source re-evaluates it automatically.',
        '',
        `Fingerprint: \`${defect.fingerprint}\``,
      ].join('\n'),
      priority: 3,
      reopenTerminal: true,
    });
    console.log(
      `[marketing-cert] ${packet.subject.id} defect ${defect.fingerprint} -> ${result.ok ? ('action' in result ? result.action : 'ok') : result.reason}`
    );
  }
  return defects.length;
}

/**
 * Posts one packet to the evidence ingest route. The store decides state; the
 * caller only learns whether the post was accepted. Shared with seo:certify.
 */
export async function postCertificationPacket(
  baseUrl: string,
  secret: string,
  packet: CertificationReviewPacket,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; summary: string }> {
  const response = await fetchImpl(new URL(INGEST_PATH, baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ evaluatedAt: new Date().toISOString(), packet }),
  });
  const body = await response.text();
  return {
    ok: response.ok,
    summary: `${response.status} ${body.slice(0, 300)}`,
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
  const storyFiles = listStoryFiles(join(WEB_ROOT, 'components')).map(path => ({
    path: relative(WEB_ROOT, path),
    title: /title:\s*'([^']+)'/u.exec(readFileSync(path, 'utf8'))?.[1] ?? '',
  }));
  const plan = certificationPlans({
    entries: MARKETING_COMPONENT_REGISTRY,
    storyFiles,
    all: true,
    changed,
    exists: path => existsSync(join(REPO_ROOT, path)),
    readSource: path => {
      const sourcePath = join(REPO_ROOT, path);
      return existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : null;
    },
  });
  const selection = selectCertificationPlans(
    plan,
    changed,
    values.all ?? false
  );
  console.log(
    `[marketing-cert] selection=${selection.reason} entries=${selection.plans.length}/${plan.length} invalidatedBy=${JSON.stringify(selection.invalidatedBy)}`
  );
  if (selection.plans.length === 0) {
    console.log('[marketing-cert] no registry entry affected');
    return;
  }

  const penIssueIds = new Set(
    validateMarketingPenRegistry().map(issue => issue.id)
  );
  const invariants = runVitest(INVARIANT_SUITES);
  const ownTestFiles = [
    ...new Set(selection.plans.flatMap(item => item.ownTestFiles)),
  ];
  const ownTests = ownTestFiles.length > 0 ? runVitest(ownTestFiles) : null;
  const storyPaths = [
    ...new Set(
      selection.plans.flatMap(item => (item.story ? [item.story.path] : []))
    ),
  ];
  const stories =
    storyPaths.length > 0
      ? runVitest(['--config=vitest.config.storybook.mts', ...storyPaths])
      : null;

  const secret = process.env.CRON_SECRET;
  let failures = 0;
  for (const item of selection.plans) {
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
    const posted = await postCertificationPacket(
      values['base-url'] ?? 'https://jov.ie',
      secret,
      packet
    );
    console.log(`[marketing-cert] ${item.entry.id} -> ${posted.summary}`);
    if (!posted.ok) failures += 1;
    await fileDefects(packet, sha);
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
