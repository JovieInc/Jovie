import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOVIE_TEAM_ID } from '../lib/linear-issue-intake.mjs';

const LINEAR_API = 'https://api.linear.app/graphql';
const LABEL_PREFIX = 'remediation:sec-jovie-';
const LIVE_BUILD_INFO = 'https://jov.ie/api/health/build-info';
const KEY_LINE = /^Remediation-Key:\s*(\S+)/gim;
const CLAIM_LINE = /^(?:Codex-Finding|Remediation-Key):\s*(\S+)/gim;
const SEVERITY_LINE = /^Severity:\s*(critical|high|medium|low|info)\b/im;
const FILES_LINE = /^Files:\s*(.+)$/gim;

export function parseIssueFooter(description) {
  const text = String(description ?? '');
  const keys = [...text.matchAll(KEY_LINE)].map(match => match[1]);
  const severity = text.match(SEVERITY_LINE)?.[1]?.toLowerCase() ?? null;
  const files = [...text.matchAll(FILES_LINE)].flatMap(match =>
    match[1]
      .split(',')
      .map(file => file.trim().replace(/^\.\//, ''))
      .filter(Boolean)
  );
  return { key: keys[0] ?? null, severity, files };
}

export function blockingIssues(issues, changedFiles, context = {}) {
  const changed = new Set(
    (changedFiles ?? [])
      .map(file => file.trim().replace(/^\.\//, ''))
      .filter(Boolean)
  );
  const labels = context.labels ?? [];
  if (
    labels.includes('security-gate:override') ||
    labels.includes('security:claimed-external')
  ) {
    return [];
  }
  const body = String(context.prBody ?? '');
  const claims = new Set(
    [...body.matchAll(CLAIM_LINE)].map(match => match[1]).filter(Boolean)
  );
  const blocking = [];
  for (const issue of issues ?? []) {
    const footer = parseIssueFooter(issue.description);
    if (!['critical', 'high'].includes(footer.severity)) continue;
    if (!footer.files.some(file => changed.has(file))) continue;
    if (footer.key && claims.has(footer.key)) continue;
    if (issue.identifier) blocking.push(issue.identifier);
  }
  return [...new Set(blocking)];
}

export function gateDecision(input) {
  if (!input.hasApiKey) {
    return {
      status: 'skipped',
      reason: 'missing_linear_api_key',
      blocking: [],
      exitCode: 0,
    };
  }
  const blocking = input.blocking ?? [];
  if (!input.enabled) return { status: 'report-only', blocking, exitCode: 0 };
  if (input.unavailable) {
    return {
      status: 'fail',
      reason: 'linear_unavailable',
      blocking,
      exitCode: 1,
    };
  }
  if (blocking.length > 0) return { status: 'fail', blocking, exitCode: 1 };
  return { status: 'pass', blocking, exitCode: 0 };
}

export function formatGateReport(decision) {
  const lines = [`security-gate: ${decision.status}`];
  if (decision.reason) lines.push(decision.reason);
  lines.push(decision.blocking?.length ? decision.blocking.join(' ') : 'none');
  return `${lines.join('\n')}\n`;
}

async function linearIssues(apiKey, fetchImpl) {
  const nodes = [];
  let cursor = null;
  for (let page = 0; page < 5; page += 1) {
    const response = await fetchImpl(LINEAR_API, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query SecurityGateIssues($teamId: ID!, $prefix: String!, $after: String) {
            issues(
              first: 50
              after: $after
              filter: {
                team: { id: { eq: $teamId } }
                state: { type: { nin: ["completed", "canceled"] } }
                labels: { some: { name: { startsWith: $prefix } } }
              }
            ) {
              nodes { identifier description }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        variables: {
          teamId: JOVIE_TEAM_ID,
          prefix: LABEL_PREFIX,
          after: cursor,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('linear_unavailable');
    const body = await response.json();
    if (body?.errors?.length) throw new Error('linear_unavailable');
    const issues = body?.data?.issues;
    nodes.push(...(issues?.nodes ?? []));
    if (!issues?.pageInfo?.hasNextPage) break;
    cursor = issues.pageInfo.endCursor;
  }
  return nodes.map(node => ({
    identifier: node?.identifier ?? null,
    description: String(node?.description ?? ''),
  }));
}

async function compareFiles(base, head, env, fetchImpl) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!repo || !token || !base || !head || base === head) return [];
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/compare/${base}...${head}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'jovie-security-gate',
      },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) throw new Error('compare_unavailable');
  const body = await response.json();
  if (!Array.isArray(body.files) || body.files.length >= 300) {
    throw new Error('compare_unavailable');
  }
  return body.files.map(file => file.filename).filter(Boolean);
}

async function liveSha(fetchImpl) {
  const response = await fetchImpl(LIVE_BUILD_INFO, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('live_sha_unavailable');
  const body = await response.json();
  if (!/^[0-9a-f]{40}$/.test(body?.commitSha ?? '')) {
    throw new Error('live_sha_unavailable');
  }
  return body.commitSha;
}

function eventContext(event) {
  const pull = event?.pull_request;
  if (pull) {
    return {
      prBody: pull.body ?? '',
      labels: (pull.labels ?? []).map(label => label.name).filter(Boolean),
      base: pull.base?.sha ?? null,
      head: pull.head?.sha ?? null,
    };
  }
  const group = event?.merge_group;
  if (group) {
    return {
      prBody: '',
      labels: [],
      base: group.base_sha ?? null,
      head: group.head_sha ?? null,
    };
  }
  return { prBody: '', labels: [], base: null, head: null };
}

async function associatedPull(head, env, fetchImpl) {
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!repo || !token || !head) return null;
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/commits/${head}/pulls`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'jovie-security-gate',
      },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!response.ok) return null;
  const pulls = await response.json();
  const pull = Array.isArray(pulls) ? pulls[0] : null;
  if (!pull) return null;
  return {
    prBody: pull.body ?? '',
    labels: (pull.labels ?? []).map(label => label.name).filter(Boolean),
  };
}

export async function runSecurityGate(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const enabled = env.SECURITY_GATE_ENABLED === 'true';
  const hasApiKey = Boolean(env.LINEAR_API_KEY);
  const write = text => {
    process.stdout.write(text);
    if (options.summaryPath) appendFileSync(options.summaryPath, text);
  };
  if (!hasApiKey) {
    const decision = gateDecision({ hasApiKey: false });
    write(formatGateReport(decision));
    return decision;
  }

  let changedFiles = options.changedFiles;
  let prBody = options.prBody;
  let labels = options.labels;
  let unavailable = false;
  if (changedFiles == null || prBody == null || labels == null) {
    let event = {};
    if (env.GITHUB_EVENT_PATH) {
      try {
        event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      } catch {
        event = {};
      }
    }
    const fromEvent = eventContext(event);
    prBody = prBody ?? fromEvent.prBody;
    labels = labels ?? fromEvent.labels;
    if (changedFiles == null) {
      try {
        if (env.SECURITY_GATE_MODE === 'production') {
          const base = await liveSha(fetchImpl);
          changedFiles = await compareFiles(
            base,
            env.SECURITY_GATE_HEAD,
            env,
            fetchImpl
          );
        } else {
          changedFiles = await compareFiles(
            fromEvent.base,
            fromEvent.head,
            env,
            fetchImpl
          );
          if (env.GITHUB_EVENT_NAME === 'merge_group' && !prBody) {
            const pull = await associatedPull(fromEvent.head, env, fetchImpl);
            if (pull) {
              prBody = pull.prBody;
              labels = labels?.length ? labels : pull.labels;
            }
          }
        }
      } catch {
        unavailable = true;
        changedFiles = [];
      }
    }
  }

  let issues = options.issues ?? null;
  if (!issues && !unavailable) {
    try {
      issues = await linearIssues(env.LINEAR_API_KEY, fetchImpl);
    } catch {
      unavailable = true;
      issues = [];
    }
  }
  const blocking = unavailable
    ? []
    : blockingIssues(issues ?? [], changedFiles ?? [], {
        prBody: prBody ?? '',
        labels: labels ?? [],
      });
  const decision = gateDecision({
    blocking,
    enabled,
    hasApiKey: true,
    unavailable,
  });
  write(formatGateReport(decision));
  return decision;
}

function changedFilesArg(argv) {
  const index = argv.indexOf('--changed-files');
  if (index === -1 || !argv[index + 1]) return null;
  return readFileSync(argv[index + 1], 'utf8')
    .split(/\r?\n/)
    .map(file => file.trim())
    .filter(Boolean);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runSecurityGate({
    changedFiles: changedFilesArg(process.argv),
    summaryPath: process.env.GITHUB_STEP_SUMMARY || null,
  })
    .then(decision => {
      process.exitCode = decision.exitCode;
    })
    .catch(() => {
      process.stdout.write('security-gate: fail\nlinear_unavailable\nnone\n');
      process.exitCode = process.env.SECURITY_GATE_ENABLED === 'true' ? 1 : 0;
    });
}
