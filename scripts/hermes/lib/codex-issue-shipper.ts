export const CODEX_SOURCE_LABEL = 'codex';
export const CODEX_CLAIM_LABEL = 'codex-in-progress';
export const CODEX_BLOCKED_LABEL = 'codex-blocked';
export const HUMAN_REVIEW_LABEL = 'human-review-required';

export interface GithubIssueLabel {
  readonly name: string;
}

export interface GithubIssue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null;
  readonly url: string;
  readonly updatedAt?: string;
  readonly labels: ReadonlyArray<GithubIssueLabel>;
}

export interface ShipperConfig {
  readonly repo: string;
  readonly repoRoot: string;
  readonly maxIssuesPerRun: number;
  readonly issueFetchLimit: number;
  readonly integrationThreshold: number;
  readonly agent: 'claude' | 'codex';
  readonly simpleModel: string;
  readonly standardModel: string;
  readonly escalationModel: string;
  readonly fallbackModel: string;
  readonly claudePermissionMode: string;
  readonly agentTimeoutMs: number;
  readonly dryRun: boolean;
}

export type RiskLevel = 'low' | 'medium' | 'high';
export type ModelProfile = 'simple' | 'standard' | 'escalation';

export interface TaskRoute {
  readonly riskLevel: RiskLevel;
  readonly modelProfile: ModelProfile;
  readonly sessionModel: string;
  readonly fallbackModel: string;
  readonly maxTurns: number;
  readonly reasons: ReadonlyArray<string>;
  readonly specialistSubagents: ReadonlyArray<{
    readonly name: string;
    readonly model: string;
    readonly required: boolean;
  }>;
}

export interface DispatchPlan {
  readonly issue: GithubIssue;
  readonly branchName: string;
  readonly integrationBranch: string | null;
  readonly route: TaskRoute;
}

export interface GbrainContext {
  readonly captureSlug: string;
  readonly queryText: string;
  readonly queryResult: string;
}

export interface BuildPromptInput {
  readonly issue: GithubIssue;
  readonly branchName: string;
  readonly baseBranch: string;
  readonly integrationBranch: string | null;
  readonly route: TaskRoute;
  readonly gbrain: GbrainContext;
  readonly repoRoot: string;
}

const HIGH_RISK_PATTERN =
  /\b(auth|billing|stripe|payment|checkout|entitlement|clerk|security|secret|token|webhook|middleware|proxy|database|db|drizzle|migration|rls|csp|deploy|workflow|github actions|ci|merge queue|agent pipeline|release)\b/i;

const HIGH_COMPLEXITY_PATTERN =
  /\b(refactor|architecture|orchestrator|automation|agent|harness|cross-package|monorepo|system|integration|parallel|queue|migration)\b/i;

const SIMPLE_PATTERN =
  /\b(copy|typo|docs?|readme|comment|test-only|lint|format|chore|rename|dead code)\b/i;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBool(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function loadShipperConfig(
  env: NodeJS.ProcessEnv,
  repoRoot: string,
  repo: string
): ShipperConfig {
  const agent = env.HERMES_CODEX_SHIPPER_AGENT === 'codex' ? 'codex' : 'claude';
  return {
    repo,
    repoRoot,
    maxIssuesPerRun: parsePositiveInt(
      env.HERMES_CODEX_SHIPPER_MAX_ISSUES_PER_RUN,
      1
    ),
    issueFetchLimit: parsePositiveInt(
      env.HERMES_CODEX_SHIPPER_ISSUE_FETCH_LIMIT,
      25
    ),
    integrationThreshold: parsePositiveInt(
      env.HERMES_CODEX_SHIPPER_INTEGRATION_THRESHOLD,
      4
    ),
    agent,
    simpleModel: env.HERMES_CODEX_SHIPPER_SIMPLE_MODEL ?? 'sonnet',
    standardModel: env.HERMES_CODEX_SHIPPER_STANDARD_MODEL ?? 'sonnet',
    escalationModel: env.HERMES_CODEX_SHIPPER_ESCALATION_MODEL ?? 'opus',
    fallbackModel: env.HERMES_CODEX_SHIPPER_FALLBACK_MODEL ?? 'sonnet',
    claudePermissionMode:
      env.HERMES_CODEX_SHIPPER_CLAUDE_PERMISSION_MODE ?? 'auto',
    agentTimeoutMs: parsePositiveInt(
      env.HERMES_CODEX_SHIPPER_AGENT_TIMEOUT_MS,
      2 * 60 * 60 * 1000
    ),
    dryRun: parseBool(env.HERMES_CODEX_SHIPPER_DRY_RUN),
  };
}

export function labelNames(issue: GithubIssue): ReadonlyArray<string> {
  return issue.labels.map(label => label.name);
}

export function issueText(issue: GithubIssue): string {
  return `${issue.title}\n${issue.body ?? ''}`;
}

export function isHumanReviewRequired(issue: GithubIssue): boolean {
  const labels = new Set(labelNames(issue));
  if (labels.has(HUMAN_REVIEW_LABEL)) return true;
  return /requires human review|human-review-required/i.test(issue.body ?? '');
}

export function isAlreadyClaimedOrBlocked(issue: GithubIssue): boolean {
  const labels = new Set(labelNames(issue));
  return labels.has(CODEX_CLAIM_LABEL) || labels.has(CODEX_BLOCKED_LABEL);
}

export function eligibleCodexIssues(
  issues: ReadonlyArray<GithubIssue>
): ReadonlyArray<GithubIssue> {
  return issues.filter(
    issue => !isHumanReviewRequired(issue) && !isAlreadyClaimedOrBlocked(issue)
  );
}

export function slugify(input: string, maxLength = 48): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'issue';
}

export function branchNameForIssue(issue: GithubIssue): string {
  return `codex/gh-${issue.number}-${slugify(issue.title)}`;
}

export function selectTaskRoute(
  issue: GithubIssue,
  config: Pick<
    ShipperConfig,
    'simpleModel' | 'standardModel' | 'escalationModel' | 'fallbackModel'
  >
): TaskRoute {
  const text = issueText(issue);
  const labels = new Set(labelNames(issue));
  const reasons: string[] = [];

  const isHighRisk =
    HIGH_RISK_PATTERN.test(text) ||
    labels.has('risk:high') ||
    labels.has('security') ||
    labels.has('billing') ||
    labels.has('ci');
  const isComplex = HIGH_COMPLEXITY_PATTERN.test(text);
  const isSimple = SIMPLE_PATTERN.test(text) && !isHighRisk && !isComplex;

  let riskLevel: RiskLevel = 'medium';
  let modelProfile: ModelProfile = 'standard';
  let sessionModel = config.standardModel;
  let maxTurns = 80;

  if (isHighRisk) {
    riskLevel = 'high';
    modelProfile = 'escalation';
    sessionModel = config.escalationModel;
    maxTurns = 120;
    reasons.push('Sensitive or control-plane terms require escalation model');
  } else if (isSimple) {
    riskLevel = 'low';
    modelProfile = 'simple';
    sessionModel = config.simpleModel;
    maxTurns = 50;
    reasons.push('Docs, copy, lint, or test-only work can use simple model');
  } else if (isComplex) {
    riskLevel = 'medium';
    modelProfile = 'standard';
    sessionModel = config.standardModel;
    maxTurns = 100;
    reasons.push(
      'Cross-file or automation wording requires standard coder model'
    );
  } else {
    reasons.push('Default implementation route');
  }

  const specialistSubagents = [
    {
      name: 'testing',
      model: riskLevel === 'high' ? config.standardModel : sessionModel,
      required: true,
    },
    {
      name: 'review',
      model: sessionModel,
      required: true,
    },
    ...(riskLevel === 'high'
      ? [
          {
            name: 'security',
            model: config.escalationModel,
            required: true,
          },
        ]
      : []),
    ...(isComplex
      ? [
          {
            name: 'architecture',
            model: config.standardModel,
            required: false,
          },
        ]
      : []),
  ];

  return {
    riskLevel,
    modelProfile,
    sessionModel,
    fallbackModel: config.fallbackModel,
    maxTurns,
    reasons,
    specialistSubagents,
  };
}

export function shouldUseIntegrationBranch(args: {
  readonly issue: GithubIssue;
  readonly eligibleQueueDepth: number;
  readonly integrationThreshold: number;
  readonly route: TaskRoute;
}): boolean {
  const labels = new Set(labelNames(args.issue));
  if (labels.has('integration-branch') || labels.has('integration-train')) {
    return true;
  }
  if (args.route.riskLevel === 'high') return false;
  return args.eligibleQueueDepth >= args.integrationThreshold;
}

export function buildDispatchPlans(
  issues: ReadonlyArray<GithubIssue>,
  config: Pick<
    ShipperConfig,
    | 'maxIssuesPerRun'
    | 'integrationThreshold'
    | 'simpleModel'
    | 'standardModel'
    | 'escalationModel'
    | 'fallbackModel'
  >
): ReadonlyArray<DispatchPlan> {
  const eligible = eligibleCodexIssues(issues);
  return eligible.slice(0, config.maxIssuesPerRun).map(issue => {
    const route = selectTaskRoute(issue, config);
    const integrationBranch = shouldUseIntegrationBranch({
      issue,
      eligibleQueueDepth: eligible.length,
      integrationThreshold: config.integrationThreshold,
      route,
    })
      ? 'integration/codex-queue'
      : null;
    return {
      issue,
      branchName: branchNameForIssue(issue),
      integrationBranch,
      route,
    };
  });
}

export function buildGbrainCaptureText(issue: GithubIssue): string {
  return [
    `# Codex Issue Shipper Dispatch: GitHub #${issue.number}`,
    '',
    `Issue: ${issue.title}`,
    `URL: ${issue.url}`,
    `Labels: ${labelNames(issue).join(', ') || 'none'}`,
    issue.updatedAt ? `Updated: ${issue.updatedAt}` : null,
    '',
    '## Body',
    issue.body?.trim() || '(empty)',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function buildGbrainQuery(issue: GithubIssue): string {
  return [
    'Jovie implementation context for GitHub issue',
    `#${issue.number}`,
    issue.title,
    labelNames(issue).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

export function shellQuote(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ');
  return `'${normalized.replace(/'/g, "'\\''")}'`;
}

export function buildAgentPrompt(input: BuildPromptInput): string {
  const issueBody = input.issue.body?.trim() || '(empty)';
  const route = input.route;
  const subagents = route.specialistSubagents
    .map(
      agent =>
        `- ${agent.name}: model=${agent.model}, required=${agent.required ? 'yes' : 'no'}`
    )
    .join('\n');
  const routeReasons = route.reasons.map(reason => `- ${reason}`).join('\n');
  const integrationBlock = input.integrationBranch
    ? [
        `Base this feature branch from \`${input.integrationBranch}\`.`,
        `Use \`./scripts/loop-integration-ship.sh ${shellQuote(input.integrationBranch)} ${shellQuote(input.branchName)} ${shellQuote(input.issue.title)}\` after local verification, then make sure an integration train PR from \`${input.integrationBranch}\` to \`${input.baseBranch}\` exists and is linked.`,
        'Do not use the integration branch for sensitive shortcuts. Full main-train CI still has to run before merge.',
      ].join('\n')
    : `Base this feature branch from \`${input.baseBranch}\` and create the PR against \`${input.baseBranch}\`.`;

  return [
    'Load gstack. You are a Jovie coder agent executing a GitHub issue labeled `codex` end to end.',
    '',
    `Working directory: ${input.repoRoot}`,
    `GitHub issue: #${input.issue.number} ${input.issue.title}`,
    `Issue URL: ${input.issue.url}`,
    `Branch to use: ${input.branchName}`,
    `Linear context: this work is part of the codex-label issue shipping automation.`,
    '',
    '## Hard Requirements',
    '- Set `JOVIE_AGENT_PROFILE=coder` before editing files.',
    '- Read `AGENTS.md` and the scoped rules for any files you touch.',
    '- Use gbrain before planning. Start with the gbrain context below, then run a targeted `gbrain query` if the first results are not enough.',
    '- Use gstack workflows. For complex work run `/autoplan`; for bugs run `/investigate`; before shipping run exhaustive `/qa`; for PR creation use `/ship`.',
    '- Use subagents. At minimum dispatch testing and review subagents. Add security, performance, architecture, or design subagents when the risk profile calls for them.',
    '- Run local CodeRabbit review before shipping: `coderabbit review --agent -c AGENTS.md -t uncommitted`. Fix actionable issues, then rerun if the diff changed.',
    '- Exhaustively QA your own work. Run typecheck and focused tests. For UI edits, verify layout-shift states and capture screenshots. For backend/control-plane edits, test the failure path and the empty path.',
    '- Create a PR, link this GitHub issue with `Closes #<issue-number>`, and include exact verification output in the PR body.',
    '- If the issue needs human review, secrets, irreversible data changes, production credential changes, auth/payment changes, or destructive operations, stop and label/comment clearly instead of forcing it.',
    '',
    '## Model Route',
    `Session model: ${route.sessionModel}`,
    `Fallback model: ${route.fallbackModel}`,
    `Risk: ${route.riskLevel}`,
    `Profile: ${route.modelProfile}`,
    '',
    routeReasons || '- Default route',
    '',
    '## Required Subagents',
    subagents,
    '',
    '## Branching',
    integrationBlock,
    '',
    '## GBrain Context',
    `Captured slug: ${input.gbrain.captureSlug}`,
    `Query: ${input.gbrain.queryText}`,
    'Query result:',
    '```text',
    input.gbrain.queryResult.trim() || '(no gbrain results returned)',
    '```',
    '',
    '## Issue Body',
    '```markdown',
    issueBody,
    '```',
    '',
    'Stop only when the issue is represented by a PR with verification evidence, or when you have labeled/commented a real blocker that the automation cannot resolve safely.',
  ].join('\n');
}

export function buildAgentCommand(
  config: ShipperConfig,
  route: TaskRoute
): { readonly command: string; readonly args: ReadonlyArray<string> } {
  if (config.agent === 'codex') {
    return {
      command: 'codex',
      args: [
        'exec',
        '-',
        '-C',
        config.repoRoot,
        '--sandbox',
        'danger-full-access',
        '--ask-for-approval',
        'never',
        '-m',
        route.sessionModel,
        '--color',
        'never',
      ],
    };
  }

  return {
    command: 'claude',
    args: [
      '--print',
      '--max-turns',
      String(route.maxTurns),
      '--model',
      route.sessionModel,
      '--fallback-model',
      route.fallbackModel,
      '--permission-mode',
      config.claudePermissionMode,
    ],
  };
}
