/**
 * Extra GitHub write catalog for the workflow token-scope check.
 *
 * The core scanner enforces enqueuePullRequest. This module adds the other
 * GraphQL mutations, REST writes, Octokit writes, and CLI-subcommand narrowing.
 */

/**
 * @typedef {Record<string, string>} PermissionSet
 * @typedef {{ all?: PermissionSet, any?: PermissionSet[] }} Requirement
 * @typedef {{ call: string, index: number, kind: string, requirement: Requirement | null }} FoundCall
 */

const ISSUE_OR_PR = {
  any: [{ issues: 'write' }, { 'pull-requests': 'write' }],
};

/** @type {Record<string, Requirement>} */
export const CATALOG_GRAPHQL = {
  enablePullRequestAutoMerge: {
    all: { contents: 'write', 'pull-requests': 'write' },
  },
  disablePullRequestAutoMerge: { all: { 'pull-requests': 'write' } },
  mergePullRequest: { all: { contents: 'write' } },
  dequeuePullRequest: { all: { 'merge-queues': 'write' } },
  updatePullRequest: { all: { 'pull-requests': 'write' } },
  updatePullRequestBranch: { all: { contents: 'write' } },
  markPullRequestReadyForReview: { all: { 'pull-requests': 'write' } },
  convertPullRequestToDraft: { all: { 'pull-requests': 'write' } },
  closePullRequest: { all: { 'pull-requests': 'write' } },
  reopenPullRequest: { all: { 'pull-requests': 'write' } },
  addPullRequestReview: { all: { 'pull-requests': 'write' } },
  createCommitOnBranch: { all: { contents: 'write' } },
};

/**
 * @type {Array<{ id: string, workflow: string, job: string, call: string, missing: string[], message: string }>}
 */
export const CATALOG_ACKNOWLEDGEMENTS = [
  {
    id: 'hold-dequeue-without-merge-queues',
    workflow: '.github/workflows/merge-queue-green-enroll.yml',
    job: 'hold-failed-revision',
    call: 'dequeuePullRequest',
    missing: ['merge-queues:write'],
    message:
      'hold-failed-revision calls dequeuePullRequest from scripts/merge-group-failure-hold.mjs without merge-queues: write. The workflow documents that denial as non-fatal and says not to add permission-merge-queues unless the jovie-bot installation already has it, because an ungranted permission fails token mint before the hold is written. Tim must approve any scope change. This check does not change scopes.',
  },
  {
    id: 'dequeue-held-without-merge-queues',
    workflow: '.github/workflows/merge-queue-green-enroll.yml',
    job: 'dequeue-held',
    call: 'dequeuePullRequest',
    missing: ['merge-queues:write'],
    message:
      'dequeue-held calls dequeuePullRequest with contents: write and pull-requests: write, not merge-queues: write. The step catches the denial. Tim must approve permission-merge-queues: write if that dequeue should succeed. This check does not change scopes.',
  },
];

/** @type {Array<{ method: string, path: RegExp, requirement: Requirement }>} */
const REST_RULES = [
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}statuses\/\{\}$/,
    requirement: { all: { statuses: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/comments$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}issues\/comments\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels(?:\/\{\})?$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}labels\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/assignees$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/assignees$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/merge$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/reviews$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/requested_reviewers$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/requested_reviewers$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/update-branch$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}dispatches$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}actions\/workflows\/\{\}\/dispatches$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}actions\/runs\/\{\}\/(?:cancel|rerun|force-cancel|approve)$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}actions\/artifacts\/\{\}$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}contents\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}contents\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}check-runs$/,
    requirement: { all: { checks: 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}check-runs\/\{\}$/,
    requirement: { all: { checks: 'write' } },
  },
];

/** @type {Record<string, Requirement>} */
const OCTOKIT_WRITES = {
  'repos.createCommitStatus': { all: { statuses: 'write' } },
  'repos.createDispatchEvent': { all: { contents: 'write' } },
  'repos.merge': { all: { contents: 'write' } },
  'repos.createOrUpdateFileContents': { all: { contents: 'write' } },
  'repos.deleteFile': { all: { contents: 'write' } },
  'issues.create': ISSUE_OR_PR,
  'issues.update': ISSUE_OR_PR,
  'issues.createComment': ISSUE_OR_PR,
  'issues.updateComment': ISSUE_OR_PR,
  'issues.deleteComment': ISSUE_OR_PR,
  'issues.addLabels': ISSUE_OR_PR,
  'issues.setLabels': ISSUE_OR_PR,
  'issues.removeLabel': ISSUE_OR_PR,
  'issues.addAssignees': ISSUE_OR_PR,
  'issues.removeAssignees': ISSUE_OR_PR,
  'pulls.create': { all: { 'pull-requests': 'write' } },
  'pulls.update': { all: { 'pull-requests': 'write' } },
  'pulls.merge': { all: { contents: 'write' } },
  'pulls.createReview': { all: { 'pull-requests': 'write' } },
  'pulls.requestReviewers': { all: { 'pull-requests': 'write' } },
  'pulls.removeRequestedReviewers': { all: { 'pull-requests': 'write' } },
  'pulls.updateBranch': { all: { contents: 'write' } },
  'actions.cancelWorkflowRun': { all: { actions: 'write' } },
  'actions.reRunWorkflow': { all: { actions: 'write' } },
  'actions.reRunWorkflowFailedJobs': { all: { actions: 'write' } },
  'actions.deleteArtifact': { all: { actions: 'write' } },
  'actions.createWorkflowDispatch': { all: { actions: 'write' } },
  'git.createRef': { all: { contents: 'write' } },
  'git.updateRef': { all: { contents: 'write' } },
  'git.deleteRef': { all: { contents: 'write' } },
  'checks.create': { all: { checks: 'write' } },
  'checks.update': { all: { checks: 'write' } },
};

const WRITE_METHOD =
  /^(create|update|delete|remove|add|merge|request|cancel|rerun|trigger|submit|dismiss|lock|unlock|set)/;
const OCTOKIT_CALL =
  /\b(?:github|octokit)\.rest\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*\(/g;
const MUTATION_BLOCK = /\bmutation\b(?:\s*\([^)]*\))?\s*\{/g;
const REST_STATIC_SEGMENTS = new Set([
  'actions',
  'approve',
  'artifacts',
  'assignees',
  'branches',
  'cancel',
  'check-runs',
  'check-suites',
  'comments',
  'commits',
  'contents',
  'dispatches',
  'force-cancel',
  'git',
  'graphql',
  'issues',
  'labels',
  'merge',
  'orgs',
  'pulls',
  'refs',
  'repos',
  'requested_reviewers',
  'rerun',
  'reviews',
  'runs',
  'statuses',
  'update-branch',
  'user',
  'users',
  'workflows',
]);

/**
 * @param {Record<string, Requirement>} graphql
 * @param {typeof CATALOG_ACKNOWLEDGEMENTS} acknowledgements
 */
export function installTokenScopeCatalog(graphql, acknowledgements) {
  Object.assign(graphql, CATALOG_GRAPHQL);
  const ids = new Set(acknowledgements.map(item => item.id));
  for (const item of CATALOG_ACKNOWLEDGEMENTS) {
    if (!ids.has(item.id)) acknowledgements.push(item);
  }
}

/**
 * @param {string} raw
 */
export function normalizeRestPath(raw) {
  let value = String(raw).split('?')[0] ?? '';
  value = value.replace(/^https:\/\/api\.github\.com\//, '');
  value = value.replace(/\$\{[^}]+\}/g, '{}');
  value = value.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '{}');
  value = value.replace(/\{[^}]+\}/g, '{}');
  value = value.replace(/\/[0-9a-f]{7,40}(?=\/|$)/g, '/{}');
  value = value.replace(/\/\d+(?=\/|$)/g, '/{}');
  value = value
    .split('/')
    .map(segment =>
      segment === '{}' || REST_STATIC_SEGMENTS.has(segment) ? segment : '{}'
    )
    .join('/');
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * @param {string} method
 * @param {string} rawPath
 */
function restRequirement(method, rawPath) {
  const normalized = normalizeRestPath(rawPath);
  const call = `${method} ${normalized}`;
  if (normalized === 'graphql' || normalized.endsWith('/graphql')) {
    return { call, requirement: null };
  }
  const rule = REST_RULES.find(
    item => item.method === method && item.path.test(normalized)
  );
  return { call, requirement: rule ? rule.requirement : null };
}

/**
 * @param {string} source
 * @param {number} openIndex
 * @param {string} open
 * @param {string} close
 */
function matchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\' && quote !== "'") escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @param {string[]} tokens
 */
function ghApiFromTokens(tokens) {
  const api = tokens.findIndex(token => token === 'api');
  if (api < 0) return null;
  let method = '';
  /** @type {string[]} */
  const positionals = [];
  let sawField = false;
  for (let i = api + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-X' || token === '--method') {
      method = (tokens[i + 1] ?? '').toUpperCase();
      i += 1;
      continue;
    }
    if (token.startsWith('--method=')) {
      method = token.slice('--method='.length).toUpperCase();
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
      continue;
    }
    if (
      token === '-f' ||
      token === '-F' ||
      token === '--raw-field' ||
      token === '--input' ||
      token.startsWith('-f') ||
      token.startsWith('-F')
    ) {
      sawField = true;
      if (token === '-f' || token === '-F' || token === '--raw-field') i += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    positionals.push(token);
  }
  const rawPath = positionals.find(
    token => token.includes('/') || token === 'graphql'
  );
  if (!rawPath) return null;
  return { method: method || (sawField ? 'POST' : 'GET'), path: rawPath };
}

/**
 * @param {string} command
 * @returns {string[]}
 */
function shellTokens(command) {
  /** @type {string[]} */
  const tokens = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * @param {string} source
 * @returns {Array<{ tokens: string[], index: number }>}
 */
function ghArgumentArrays(source) {
  /** @type {Array<{ tokens: string[], index: number }>} */
  const found = [];
  const starts = [
    ...source.matchAll(/\bgh\s*\(\s*\[/g),
    ...source.matchAll(/\bexecFile(?:Sync)?\s*\(\s*['"]gh['"]\s*,\s*\[/g),
  ];
  for (const start of starts) {
    const bracket = source.indexOf('[', start.index ?? 0);
    const end = matchingDelimiter(source, bracket, '[', ']');
    if (end < 0) continue;
    /** @type {string[]} */
    const tokens = [];
    for (const literal of source
      .slice(bracket + 1, end)
      .matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)) {
      tokens.push(literal[1] ?? literal[2] ?? literal[3] ?? '');
    }
    if (
      tokens.includes('api') ||
      tokens.includes('pr') ||
      tokens.includes('merge')
    )
      found.push({ tokens, index: start.index ?? 0 });
  }
  return found;
}

/**
 * @param {string[]} tokens
 * @param {Record<string, Requirement>} graphql
 * @returns {string | null}
 */
function classifyGhPrMerge(tokens, graphql) {
  const pr = tokens.indexOf('pr');
  if (pr < 0 || tokens[pr + 1] !== 'merge') return null;
  const flags = tokens.slice(pr + 2);
  if (flags.some(token => token === '--disable-auto' || token === '--undo'))
    return 'disablePullRequestAutoMerge';
  if (flags.some(token => token === '--auto')) return null;
  if (
    flags.some(token =>
      ['--squash', '--merge', '--rebase', '-s', '-m', '-r'].includes(token)
    )
  )
    return graphql.mergePullRequest ? 'mergePullRequest' : null;
  return graphql.mergePullRequest ? 'mergePullRequest' : null;
}

/**
 * @param {FoundCall[]} calls
 * @param {string[]} tokens
 * @param {number} index
 * @param {Record<string, Requirement>} graphql
 */
function pushGhTokens(calls, tokens, index, graphql) {
  const api = ghApiFromTokens(tokens);
  if (
    api &&
    api.method !== 'GET' &&
    !normalizeRestPath(api.path).includes('graphql')
  ) {
    const resolved = restRequirement(api.method, api.path);
    calls.push({
      call: resolved.call,
      index,
      kind: 'rest',
      requirement: resolved.requirement,
    });
  }
  const merge = classifyGhPrMerge(tokens, graphql);
  if (merge) {
    calls.push({
      call: merge,
      index,
      kind: 'cli',
      requirement: graphql[merge] ?? null,
    });
  }
  const pr = tokens.indexOf('pr');
  if (pr >= 0 && tokens[pr + 1] === 'edit') {
    calls.push({
      call: 'gh pr edit',
      index,
      kind: 'cli',
      requirement: ISSUE_OR_PR,
    });
  }
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function splitShellCommands(source) {
  /** @type {string[]} */
  const commands = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (
      char === '\n' ||
      char === ';' ||
      (char === '&' && source[i + 1] === '&') ||
      (char === '|' && source[i + 1] === '|')
    ) {
      if (current.trim()) commands.push(current);
      current = '';
      if (char !== '\n' && char !== ';') i += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) commands.push(current);
  return commands;
}

/**
 * @param {string} masked already comment-masked
 * @param {'js' | 'shell'} mode
 * @param {FoundCall[]} calls
 * @param {Record<string, Requirement>} graphql
 */
export function augmentExtractedCalls(masked, mode, calls, graphql) {
  if (mode === 'js') {
    for (const match of masked.matchAll(MUTATION_BLOCK)) {
      const after = masked.slice((match.index ?? 0) + match[0].length);
      const name = /^[\s\n]*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(after)?.[1];
      if (!name || name in graphql) continue;
      calls.push({
        call: name,
        index: match.index ?? 0,
        kind: 'graphql-unmapped',
        requirement: null,
      });
    }
    for (const match of masked.matchAll(OCTOKIT_CALL)) {
      const name = `${match[1]}.${match[2]}`;
      const method = match[2] ?? '';
      if (!WRITE_METHOD.test(method) && !OCTOKIT_WRITES[name]) continue;
      calls.push({
        call: name,
        index: match.index ?? 0,
        kind: 'octokit',
        requirement: OCTOKIT_WRITES[name] ?? null,
      });
    }
    for (const request of masked.matchAll(
      /\.request\(\s*['"`](POST|PUT|PATCH|DELETE)\s+([^'"`\s]+)/g
    )) {
      const resolved = restRequirement(request[1] ?? 'POST', request[2] ?? '');
      calls.push({
        call: resolved.call,
        index: request.index ?? 0,
        kind: 'rest',
        requirement: resolved.requirement,
      });
    }
    for (const array of ghArgumentArrays(masked)) {
      pushGhTokens(calls, array.tokens, array.index, graphql);
    }
    return;
  }
  for (const command of splitShellCommands(masked)) {
    const ghAt = command.search(/\bgh\s+/);
    if (ghAt < 0) continue;
    const at = masked.indexOf(command);
    pushGhTokens(
      calls,
      shellTokens(command.slice(ghAt)),
      (at < 0 ? 0 : at) + ghAt,
      graphql
    );
  }
}

const NODE_FLAG_WITH_VALUE = new Set([
  '-r',
  '--require',
  '--experimental-loader',
  '--loader',
  '--import',
  '-C',
  '--conditions',
]);
const CALL_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'await',
  'typeof',
  'new',
  'do',
  'else',
]);

/**
 * @param {string} token
 */
function repoScriptPath(token) {
  const cleaned = token.replace(/^\.\//, '');
  const match = cleaned.match(
    /(?:^|\/)((?:scripts|\.github\/scripts)\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|sh))$/
  );
  const repoPath = match?.[1] ?? '';
  if (!repoPath || repoPath.includes('.test.')) return null;
  return repoPath;
}

/**
 * @param {string} command
 * @returns {{ script: string, subcommand: string } | null}
 */
function nodeInvocation(command) {
  const tokens = shellTokens(command);
  const nodeAt = tokens.findIndex(
    token => token === 'node' || token.endsWith('/node')
  );
  if (nodeAt < 0) return null;
  let script = '';
  for (let i = nodeAt + 1; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (token === '--') continue;
    if (NODE_FLAG_WITH_VALUE.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    if (!script) {
      script = repoScriptPath(token) ?? '';
      continue;
    }
    return { script, subcommand: token };
  }
  return script ? { script, subcommand: '' } : null;
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {{ start: number, end: number } | null}
 */
function functionRange(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declared = new RegExp(
    `(?:async\\s+function\\s+${escaped}\\s*\\(|function\\s+${escaped}\\s*\\(|(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\()`
  ).exec(source);
  if (!declared || declared.index == null) return null;
  const paren = declared.index + declared[0].lastIndexOf('(');
  const closeParen = matchingDelimiter(source, paren, '(', ')');
  if (closeParen < 0) return null;
  let cursor = closeParen + 1;
  while (cursor < source.length && /\s/.test(source[cursor] ?? '')) cursor += 1;
  if (source.startsWith('=>', cursor)) {
    cursor += 2;
    while (cursor < source.length && /\s/.test(source[cursor] ?? ''))
      cursor += 1;
  }
  if (source[cursor] !== '{') {
    const lineEnd = source.indexOf('\n', cursor);
    return {
      start: declared.index,
      end: lineEnd < 0 ? source.length - 1 : lineEnd,
    };
  }
  const end = matchingDelimiter(source, cursor, '{', '}');
  if (end < 0) return null;
  return { start: declared.index, end };
}

/**
 * @param {string} source
 * @param {string} name
 */
function stringConstRange(source, name) {
  if (!name) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declared = new RegExp(
    `(?:const|let|var)\\s+${escaped}\\s*=\\s*(['"\`])`
  ).exec(source);
  if (!declared || declared.index == null) return null;
  const quote = declared[1] ?? '';
  let cursor = declared.index + declared[0].length;
  let escapedChar = false;
  while (cursor < source.length) {
    const char = source[cursor] ?? '';
    if (quote === '`' && char === '$' && source[cursor + 1] === '{') {
      const end = matchingDelimiter(source, cursor + 1, '{', '}');
      if (end < 0) return null;
      cursor = end + 1;
      continue;
    }
    if (escapedChar) escapedChar = false;
    else if (char === '\\' && quote !== "'") escapedChar = true;
    else if (char === quote) return { start: declared.index, end: cursor };
    cursor += 1;
  }
  return null;
}

/**
 * @param {string} source
 * @param {string} subcommand
 */
function sourceForSubcommand(source, subcommand) {
  if (!subcommand) return source;
  const escaped = subcommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const handlers = [
    ...source.matchAll(
      new RegExp(
        `['"]${escaped}['"][\\s\\S]{0,200}?\\breturn\\s+([A-Za-z_$][\\w$]*)\\s*\\(`,
        'g'
      )
    ),
  ].flatMap(match => (match[1] ? [match[1]] : []));
  if (handlers.length === 0) return source;
  /** @type {Array<{ start: number, end: number }>} */
  const ranges = [];
  /** @type {string[]} */
  const queue = [...handlers];
  const seen = new Set();
  while (queue.length > 0 && seen.size < 40) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const range = functionRange(source, name);
    if (!range) continue;
    ranges.push(range);
    const body = source.slice(range.start, range.end + 1);
    for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const callee = match[1] ?? '';
      if (!callee || CALL_KEYWORDS.has(callee) || seen.has(callee)) continue;
      if (functionRange(source, callee)) queue.push(callee);
    }
    for (const match of body.matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) {
      const constant = stringConstRange(source, match[1] ?? '');
      if (constant) ranges.push(constant);
    }
  }
  if (ranges.length === 0) return source;
  const keep = new Uint8Array(source.length);
  for (const range of ranges) {
    const end = Math.min(source.length - 1, range.end);
    for (let i = Math.max(0, range.start); i <= end; i += 1) keep[i] = 1;
  }
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    out += keep[i] || char === '\n' ? char : ' ';
  }
  return out;
}

/**
 * Narrow a multi-command CLI to the subcommand this shell command invokes.
 * @param {string} source
 * @param {string} command
 */
export function scopeExecutedSource(source, command) {
  const invocation = nodeInvocation(command);
  if (!invocation?.subcommand || invocation.script === '') return source;
  return sourceForSubcommand(source, invocation.subcommand);
}
