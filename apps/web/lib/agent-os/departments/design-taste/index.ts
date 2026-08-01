import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { APP_ROUTES } from '@/constants/routes';
import {
  type AgentRunArtifact,
  parseAgentRunArtifact,
} from '@/lib/agent-os/artifact';
import {
  filterUiTouchingChanges,
  isUiTouchingPath,
} from '@/lib/agent-os/design-taste-jury/change-aware';
import { formatAgentRunArtifactComment } from '@/lib/agent-os/gate-evidence';
import {
  retainCompletedRunDirectories,
  writeTextFileAtomic,
} from '@/lib/agent-os/run-retention';
import { resolveMonorepoPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';

const DESIGN_TASTE_DEPARTMENT_SLUG = 'design-taste' as const;
export type DesignTasteTriggerKind = 'ui-pr' | 'scheduled-audit';
const DESIGN_TASTE_RULE_IDS = [
  'elevation',
  'motion',
  'emoji',
  'casing',
  'hardcoded-token',
] as const;
type DesignTasteRuleId = (typeof DESIGN_TASTE_RULE_IDS)[number];
type DesignTasteSeverity = 'error' | 'warning';
type DesignTasteFinding = {
  readonly id: string;
  readonly ruleId: DesignTasteRuleId;
  readonly severity: DesignTasteSeverity;
  readonly filePath: string;
  readonly line: number | null;
  readonly snippet: string;
  readonly message: string;
  readonly remediation: string;
};
type DesignTasteKpis = {
  readonly filesReviewed: number;
  readonly uiHunksReviewed: number;
  readonly tokenCompliantHunks: number;
  readonly designSystemCoverage: number;
  readonly violationsCaught: number;
  readonly violationsByRule: Record<string, number>;
  readonly surfaceElevationConsistencyScore: number;
};
type DesignTasteFixProposal = {
  readonly kind: 'pr-comment' | 'auto-fix-branch';
  readonly title: string;
  readonly body: string;
  readonly branchName: string | null;
  readonly findingIds: readonly string[];
};
type DesignTasteDiffHunk = {
  readonly filePath: string;
  readonly startLine: number | null;
  readonly addedLines: readonly {
    readonly line: number | null;
    readonly text: string;
  }[];
};

export type DesignTasteDepartmentRunManifest = {
  readonly runId: string;
  readonly department: typeof DESIGN_TASTE_DEPARTMENT_SLUG;
  readonly trigger: DesignTasteTriggerKind;
  readonly gitSha: string | null;
  readonly pullRequestUrl: string | null;
  readonly linearIssueId: string | null;
  readonly computedAt: string;
  readonly policyPath: string;
  readonly policyExcerpt: string;
  readonly changedFiles: readonly string[];
  readonly reviewedFiles: readonly string[];
  readonly skippedNonUiFiles: readonly string[];
  readonly findings: readonly DesignTasteFinding[];
  readonly kpis: DesignTasteKpis;
  readonly proposals: readonly DesignTasteFixProposal[];
  readonly artifactId: string;
};

const RULES: readonly {
  readonly ruleId: DesignTasteRuleId;
  readonly severity: DesignTasteSeverity;
  readonly pattern: RegExp;
  readonly message: string;
  readonly remediation: string;
}[] = [
  {
    ruleId: 'elevation',
    severity: 'error',
    pattern: /\bbg-surface-[01]\/\d{1,3}\b/,
    message: 'Semi-transparent surface undermines elevation hierarchy.',
    remediation: 'Use solid surface tokens without opacity.',
  },
  {
    ruleId: 'elevation',
    severity: 'error',
    pattern:
      /\bborder-0\b[^\n]*\bshadow-none\b|\bshadow-none\b[^\n]*\bborder-0\b/,
    message: 'Stripping border and shadow collapses card elevation.',
    remediation: 'Keep Card elevation or use a flat well.',
  },
  {
    ruleId: 'elevation',
    severity: 'warning',
    pattern: /bg-\(--linear-app-content-surface\)/,
    message: 'App-shell canvas on a child often creates invisible cards.',
    remediation: 'Use bg-surface-1 for cards.',
  },
  {
    ruleId: 'motion',
    severity: 'error',
    pattern:
      /(?:hover|group-hover):(?:-?translate-[xy]?|scale(?:-\w+)?)\b|transition-all\b/,
    message: 'Decorative hover motion or transition-all is banned.',
    remediation: 'Prefer color/border/opacity hover feedback.',
  },
  {
    ruleId: 'emoji',
    severity: 'error',
    pattern:
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u,
    message: 'Emoji is not allowed in product UI markup or strings.',
    remediation: 'Replace with Lucide or SocialIcon.',
  },
  {
    ruleId: 'casing',
    severity: 'warning',
    pattern: /\b(?:className|class)=['"`][^'"`]*\buppercase\b/,
    message: 'All-caps uppercase chrome is off-style for product UI labels.',
    remediation: 'Use Title Case without uppercase transforms.',
  },
  {
    ruleId: 'hardcoded-token',
    severity: 'error',
    pattern: /(?:text|bg|border|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/,
    message: 'Arbitrary hex color bypasses the design-token system.',
    remediation: 'Use a semantic token.',
  },
];

const REVIEWABLE = new Set(['.tsx', '.ts', '.jsx', '.js', '.css', '.mdx']);
const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const ALLOWED_ACTIONS = [
  'read',
  'classify',
  'rank',
  'summarize',
  'draft',
  'open_pr',
] as const;
const FORBIDDEN_ACTIONS = [
  'merge',
  'deploy',
  'ready_pr',
  'mutate_production_data',
  'change_auth',
  'change_billing',
  'change_security',
  'send_outbound',
] as const;
const norm = (p: string) => p.trim().replaceAll('\\', '/');
const ext = (p: string) => {
  const b = norm(p).split('/').pop() ?? '';
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i).toLowerCase();
};
const clamp01 = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 1 ? 1 : n);
const snip = (t: string) => {
  const s = t.trim().replaceAll(/\s+/g, ' ');
  return s.length <= 160 ? s : `${s.slice(0, 157)}…`;
};
const getDesignTasteDepartmentRootDirectory = () =>
  resolveMonorepoPath('agentos', 'runs', 'design-taste');
const getDesignTastePolicyPath = () =>
  resolveMonorepoPath('agentos', 'memory', 'design-taste.md');

function isDesignTasteReviewablePath(filePath: string): boolean {
  const p = norm(filePath);
  if (!isUiTouchingPath(p) || !REVIEWABLE.has(ext(p))) return false;
  if (p.includes('/tests/') && !p.includes('/product-screenshots/'))
    return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p)) return false;
  return !(p.endsWith('.stories.tsx') || p.endsWith('.stories.ts'));
}

function selectDesignTasteReviewFiles(changedFiles: readonly string[]): {
  readonly reviewedFiles: readonly string[];
  readonly skippedNonUiFiles: readonly string[];
} {
  const normalized = changedFiles.map(norm).filter(Boolean);
  const reviewedFiles = filterUiTouchingChanges(normalized).filter(
    isDesignTasteReviewablePath
  );
  const set = new Set(reviewedFiles);
  return {
    reviewedFiles,
    skippedNonUiFiles: normalized.filter(f => !set.has(f)),
  };
}

export function decideDesignTasteDispatch(params: {
  readonly changedFiles: readonly string[];
  readonly forceScheduledAudit?: boolean;
}): {
  readonly shouldRun: boolean;
  readonly trigger: DesignTasteTriggerKind;
  readonly reason: string;
  readonly uiTouchingFiles: readonly string[];
} {
  if (params.forceScheduledAudit) {
    return {
      shouldRun: true,
      trigger: 'scheduled-audit',
      reason: 'Scheduled design-system audit trigger.',
      uiTouchingFiles: filterUiTouchingChanges(params.changedFiles),
    };
  }
  const uiTouchingFiles = filterUiTouchingChanges(params.changedFiles);
  if (uiTouchingFiles.length === 0) {
    return {
      shouldRun: false,
      trigger: 'ui-pr',
      reason: 'No UI-touching paths in changed files; skip Design/Taste run.',
      uiTouchingFiles,
    };
  }
  return {
    shouldRun: true,
    trigger: 'ui-pr',
    reason: `UI PR touch detected (${uiTouchingFiles.length} path(s)).`,
    uiTouchingFiles,
  };
}

export function parseUnifiedDiff(
  diffText: string
): readonly DesignTasteDiffHunk[] {
  const hunks: DesignTasteDiffHunk[] = [];
  let file: string | null = null;
  let hunk: DesignTasteDiffHunk | null = null;
  let cursor: number | null = null;
  const flush = () => {
    if (hunk?.addedLines.length) hunks.push(hunk);
    hunk = null;
  };
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      file = null;
      cursor = null;
      continue;
    }
    if (line.startsWith('+++ ')) {
      flush();
      const part = line.slice(4).trim();
      file = part === '/dev/null' ? null : norm(part.replace(/^b\//, ''));
      continue;
    }
    if (line.startsWith('@@')) {
      flush();
      if (!file || !isDesignTasteReviewablePath(file)) {
        hunk = null;
        cursor = null;
        continue;
      }
      const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      cursor = m ? Number(m[1]) : null;
      hunk = { filePath: file, startLine: cursor, addedLines: [] };
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      hunk = {
        ...hunk,
        addedLines: [...hunk.addedLines, { line: cursor, text: line.slice(1) }],
      };
      if (cursor !== null) cursor += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) continue;
    if ((line.startsWith(' ') || line === '') && cursor !== null) cursor += 1;
  }
  flush();
  return hunks;
}

export function reviewDesignTasteHunks(
  hunks: readonly DesignTasteDiffHunk[]
): readonly DesignTasteFinding[] {
  const out: DesignTasteFinding[] = [];
  const seen = new Set<string>();
  for (const h of hunks) {
    for (const a of h.addedLines) {
      if (!a.text.trim()) continue;
      for (const rule of RULES) {
        if (!rule.pattern.test(a.text)) continue;
        rule.pattern.lastIndex = 0;
        const s = snip(a.text);
        const id = `dt-${rule.ruleId}-${createHash('sha1')
          .update(`${rule.ruleId}|${h.filePath}|${a.line ?? 0}|${s}`)
          .digest('hex')
          .slice(0, 12)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          ruleId: rule.ruleId,
          severity: rule.severity,
          filePath: h.filePath,
          line: a.line,
          snippet: s,
          message: rule.message,
          remediation: rule.remediation,
        });
      }
    }
  }
  return out.sort((a, b) =>
    a.filePath === b.filePath
      ? (a.line ?? 0) - (b.line ?? 0)
      : a.filePath.localeCompare(b.filePath)
  );
}

function computeDesignTasteKpis(params: {
  readonly filesReviewed: number;
  readonly uiHunksReviewed: number;
  readonly findings: readonly DesignTasteFinding[];
}): DesignTasteKpis {
  const byRule: Record<string, number> = Object.fromEntries(
    DESIGN_TASTE_RULE_IDS.map(r => [r, 0])
  );
  for (const f of params.findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1;
  }
  const ui = Math.max(0, params.uiHunksReviewed);
  const hard = byRule['hardcoded-token'] ?? 0;
  const elev = byRule.elevation ?? 0;
  const compliant = Math.max(0, ui - hard);
  const files = Math.max(0, params.filesReviewed);
  return {
    filesReviewed: files,
    uiHunksReviewed: ui,
    tokenCompliantHunks: compliant,
    designSystemCoverage: Number(
      (ui === 0 ? 1 : clamp01(compliant / ui)).toFixed(4)
    ),
    violationsCaught: params.findings.length,
    violationsByRule: byRule,
    surfaceElevationConsistencyScore: Number(
      (files === 0 ? 1 : clamp01(1 - elev / files)).toFixed(4)
    ),
  };
}

async function readDesignTastePolicy(params?: {
  readonly policyPath?: string;
  readonly maxExcerptChars?: number;
}): Promise<{ path: string; content: string; excerpt: string }> {
  const policyPath = params?.policyPath ?? getDesignTastePolicyPath();
  const max = params?.maxExcerptChars ?? 1600;
  let content = '';
  try {
    content = await fs.readFile(policyPath, 'utf8');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error(
        `Design/Taste policy missing at ${policyPath}. Seed agentos/memory/design-taste.md.`
      );
    }
    throw error;
  }
  const trimmed = content.trim();
  if (!trimmed)
    throw new Error(`Design/Taste policy at ${policyPath} is empty.`);
  return {
    path: policyPath,
    content: trimmed,
    excerpt:
      trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}\n…`,
  };
}

function buildArtifact(params: {
  readonly runId: string;
  readonly trigger: DesignTasteTriggerKind;
  readonly findings: readonly DesignTasteFinding[];
  readonly kpis: DesignTasteKpis;
  readonly pullRequestUrl: string | null;
  readonly linearIssueId: string | null;
  readonly gitSha: string | null;
  readonly computedAt: string;
}): AgentRunArtifact {
  const errors = params.findings.filter(f => f.severity === 'error').length;
  const noneGate = {
    required: false as const,
    status: 'not_required' as const,
    reason: null,
    reviewer: null,
    reviewedAt: null,
  };
  return parseAgentRunArtifact({
    id: `design-taste-${params.runId}`,
    source: params.trigger === 'ui-pr' ? 'github' : 'ci',
    sourceRunId: params.runId,
    kind: 'design_review',
    status: params.findings.length > 0 ? 'review' : 'done',
    title: 'Design/Taste department review',
    summary: `Design/Taste ${params.trigger}: reviewed ${params.kpis.filesReviewed} file(s), ${params.kpis.violationsCaught} violation(s), coverage ${(params.kpis.designSystemCoverage * 100).toFixed(1)}%, elevation ${(params.kpis.surfaceElevationConsistencyScore * 100).toFixed(1)}%.`,
    modelRoute: 'deterministic',
    allowedActions: [...ALLOWED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    humanApprovalRequired: errors > 0,
    humanGate:
      errors > 0
        ? {
            required: true,
            status: 'pending',
            reason: 'Design/Taste errors require remediation before ready_pr.',
            reviewer: null,
            reviewedAt: null,
          }
        : noneGate,
    linearIssueId: params.linearIssueId,
    linearIssueUrl: params.linearIssueId
      ? `https://linear.app/jovie/issue/${params.linearIssueId}`
      : null,
    pullRequestUrl: params.pullRequestUrl,
    adminSurface: APP_ROUTES.ADMIN_OPS,
    verificationGates: [
      {
        name: 'gstack.review',
        required: false,
        status: errors > 0 ? 'failed' : 'passed',
        evidenceUrl: null,
        summary:
          errors > 0
            ? `${errors} design/taste error(s) require fixes.`
            : 'No error-severity design/taste violations.',
        checkedAt: params.computedAt,
      },
    ],
    costEstimate: {
      usd: 0,
      route: 'deterministic',
      inputTokens: 0,
      outputTokens: 0,
      notes: 'Deterministic regex taste scanners; no model call.',
    },
    blockedReason: null,
    createdAt: params.computedAt,
    updatedAt: params.computedAt,
    metadata: {
      department: 'design-taste',
      trigger: params.trigger,
      gitSha: params.gitSha,
      kpis: params.kpis,
      findingIds: params.findings.map(f => f.id),
      policy: 'agentos/memory/design-taste.md',
    },
  });
}

function buildProposals(params: {
  readonly runId: string;
  readonly trigger: DesignTasteTriggerKind;
  readonly findings: readonly DesignTasteFinding[];
  readonly kpis: DesignTasteKpis;
  readonly artifact: AgentRunArtifact;
}): DesignTasteFixProposal[] {
  const errors = params.findings.filter(f => f.severity === 'error');
  const warnings = params.findings.filter(f => f.severity === 'warning');
  const line = (f: DesignTasteFinding) =>
    `- **${f.ruleId}** (${f.severity}) \`${f.line == null ? f.filePath : `${f.filePath}:${f.line}`}\` — ${f.message}`;
  const pr: DesignTasteFixProposal = {
    kind: 'pr-comment',
    title: 'Design/Taste department review',
    body: [
      '## Design/Taste Department Review',
      `Run \`${params.runId}\` · \`${params.trigger}\` · coverage ${(params.kpis.designSystemCoverage * 100).toFixed(1)}% · violations ${params.kpis.violationsCaught} · elevation ${(params.kpis.surfaceElevationConsistencyScore * 100).toFixed(1)}%`,
      errors.length
        ? `### Errors\n${errors.map(line).join('\n')}`
        : '### Errors\nNone.',
      warnings.length
        ? `### Warnings\n${warnings.map(line).join('\n')}`
        : '### Warnings\nNone.',
      'Policy: `agentos/memory/design-taste.md` + `DESIGN.md`.',
      formatAgentRunArtifactComment(params.artifact),
    ].join('\n'),
    branchName: null,
    findingIds: params.findings.map(f => f.id),
  };
  if (!errors.length) return [pr];
  const branch = `agent/design-taste-autofix-${params.runId}`
    .replaceAll(/[^a-zA-Z0-9._/-]+/g, '-')
    .slice(0, 120);
  return [
    pr,
    {
      kind: 'auto-fix-branch',
      title: 'Design/Taste auto-fix branch proposal',
      body: `Auto-fix proposal (do not merge unattended).\n${errors.map(f => `- [${f.ruleId}] ${f.filePath}${f.line ? `:${f.line}` : ''} — ${f.remediation}`).join('\n')}\nBranch: \`${branch}\``,
      branchName: branch,
      findingIds: errors.map(f => f.id),
    },
  ];
}

export interface RunDesignTasteDepartmentParams {
  readonly runId: string;
  readonly changedFiles: readonly string[];
  readonly unifiedDiff?: string | null;
  readonly gitSha?: string | null;
  readonly pullRequestUrl?: string | null;
  readonly linearIssueId?: string | null;
  readonly forceScheduledAudit?: boolean;
  readonly policyPath?: string;
  readonly rootDirectory?: string;
}
export interface RunDesignTasteDepartmentResult {
  readonly ran: boolean;
  readonly skippedReason: string | null;
  readonly trigger: DesignTasteTriggerKind;
  readonly manifest: DesignTasteDepartmentRunManifest | null;
  readonly manifestPath: string | null;
  readonly artifactPath: string | null;
  readonly prCommentPath: string | null;
}

function runPath(runId: string, root: string | undefined, ...parts: string[]) {
  const safe = runId.trim();
  if (!RUN_ID.test(safe)) {
    throw new Error(`Invalid run id: ${runId}`);
  }
  return validatePathTraversal(
    path.join(safe, ...parts),
    root ?? getDesignTasteDepartmentRootDirectory()
  );
}

export async function runDesignTasteDepartment(
  params: RunDesignTasteDepartmentParams
): Promise<RunDesignTasteDepartmentResult> {
  const dispatch = decideDesignTasteDispatch({
    changedFiles: params.changedFiles,
    forceScheduledAudit: params.forceScheduledAudit,
  });
  if (!dispatch.shouldRun) {
    return {
      ran: false,
      skippedReason: dispatch.reason,
      trigger: dispatch.trigger,
      manifest: null,
      manifestPath: null,
      artifactPath: null,
      prCommentPath: null,
    };
  }
  const policy = await readDesignTastePolicy({ policyPath: params.policyPath });
  const { reviewedFiles, skippedNonUiFiles } = selectDesignTasteReviewFiles(
    params.changedFiles
  );
  const hunks = params.unifiedDiff ? parseUnifiedDiff(params.unifiedDiff) : [];
  const findings = reviewDesignTasteHunks(hunks);
  const kpis = computeDesignTasteKpis({
    filesReviewed: reviewedFiles.length,
    uiHunksReviewed: hunks.reduce((n, h) => n + h.addedLines.length, 0),
    findings,
  });
  const computedAt = new Date().toISOString();
  const artifact = buildArtifact({
    runId: params.runId,
    trigger: dispatch.trigger,
    findings,
    kpis,
    pullRequestUrl: params.pullRequestUrl ?? null,
    linearIssueId: params.linearIssueId ?? null,
    gitSha: params.gitSha ?? null,
    computedAt,
  });
  const proposals = buildProposals({
    runId: params.runId,
    trigger: dispatch.trigger,
    findings,
    kpis,
    artifact,
  });
  const manifest: DesignTasteDepartmentRunManifest = {
    runId: params.runId,
    department: 'design-taste',
    trigger: dispatch.trigger,
    gitSha: params.gitSha ?? null,
    pullRequestUrl: params.pullRequestUrl ?? null,
    linearIssueId: params.linearIssueId ?? null,
    computedAt,
    policyPath: policy.path,
    policyExcerpt: policy.excerpt,
    changedFiles: [...params.changedFiles],
    reviewedFiles: [...reviewedFiles],
    skippedNonUiFiles: [...skippedNonUiFiles],
    findings: [...findings],
    kpis,
    proposals,
    artifactId: artifact.id,
  };
  const root = params.rootDirectory;
  await fs.mkdir(runPath(params.runId, root), { recursive: true });
  const manifestPath = runPath(params.runId, root, 'manifest.json');
  const artifactPath = runPath(params.runId, root, 'agent-run-artifact.json');
  const prCommentPath = runPath(params.runId, root, 'pr-comment.md');
  const prBody =
    proposals.find(p => p.kind === 'pr-comment')?.body ??
    'Design/Taste department review';
  await writeTextFileAtomic(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeTextFileAtomic(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  await writeTextFileAtomic(prCommentPath, `${prBody}\n`);
  await writeTextFileAtomic(
    runPath(params.runId, root, 'complete.json'),
    `${JSON.stringify({ status: 'completed', runId: params.runId, completedAt: computedAt, department: 'design-taste' }, null, 2)}\n`
  );
  await retainCompletedRunDirectories({
    completionMarker: 'complete.json',
    currentRunId: params.runId,
    keepCompleted: 14,
    root: root ?? getDesignTasteDepartmentRootDirectory(),
    staleIncompleteMs: 7 * 24 * 60 * 60 * 1000,
  });
  return {
    ran: true,
    skippedReason: null,
    trigger: dispatch.trigger,
    manifest,
    manifestPath,
    artifactPath,
    prCommentPath,
  };
}
