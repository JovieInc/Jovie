export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v0/agents';
export const JOVIE_GITHUB_REPO = 'https://github.com/JovieInc/Jovie';

/**
 * @param {string} apiKey
 * @returns {string}
 */
export function cursorAuthHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/** @param {unknown} agents @param {string} [fingerprint] @returns {string[]} */
export function findOwnedFxAgents(agents, fingerprint) {
  const list = Array.isArray(agents) ? agents : [];
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return list
    .filter(agent => {
      const haystack = JSON.stringify(agent ?? {}).toLowerCase();
      return haystack.includes(needle.toLowerCase());
    })
    .map(agent => {
      const record = /** @type {Record<string, unknown>} */ (agent ?? {});
      return record.id;
    })
    .filter(
      /** @returns {id is string} */
      id => typeof id === 'string' && id.length > 0
    );
}

/**
 * @param {object} input
 * @returns {string}
 */
export function buildFxRepairPrompt({
  repository,
  pr,
  head,
  branch,
  check,
  fingerprint,
  failedSteps = [],
  eventName,
}) {
  const steps = (Array.isArray(failedSteps) ? failedSteps : [])
    .map(step => String(step).trim())
    .filter(Boolean);
  return [
    'P0: repair this open pull request at the exact failing head. Do not open a second PR.',
    '',
    `Repository: ${repository}`,
    `PR: #${pr}`,
    `Branch: ${branch}`,
    `Exact head: ${head}`,
    `Failed check: ${check}`,
    `Failure fingerprint: ${fingerprint}`,
    `Webhook: ${eventName}`,
    steps.length > 0
      ? `Failed steps: ${steps.join(', ')}`
      : 'Failed steps: (not provided)',
    '',
    'Constraints:',
    '- Work only on this PR branch and this exact head.',
    '- Draft PRs are in scope. Agent Pipeline skipping drafts is not a reason to no-op.',
    '- Do not check out untrusted workflow payloads as executable code; repair the branch.',
    '- Do not merge, deploy, or promote.',
    '- Do not add the queue-deferred label.',
    '- Native merge-queue autoenroll is the hold during hold-intake.',
    '- Add or update the smallest regression test that would have caught this failure.',
    '- Do not split the monorepo. Do not invent a second fleet hold.',
  ].join('\n');
}

/**
 * Cursor-direct exact-head repair for the current PR branch.
 * autoCreatePr stays false so FX does not open a competing PR.
 * @param {object} [input]
 */
export function planFxCursorLaunch({
  cursorApiKey,
  existingAgentIds = [],
  repository,
  pr,
  head,
  branch,
  check,
  fingerprint,
  failedSteps = [],
  eventName,
} = {}) {
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'fail_closed',
      reason: 'missing_cursor_api_key',
      fingerprint,
    };
  }
  const owned = (
    Array.isArray(existingAgentIds) ? existingAgentIds : []
  ).filter(id => typeof id === 'string' && id.length > 0);
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      fingerprint,
      existingAgentIds: owned,
    };
  }
  const repoUrl = /^https:\/\//.test(String(repository ?? ''))
    ? String(repository)
    : `https://github.com/${repository}`;
  return {
    action: 'launch',
    reason: 'implementer_lease_not_live',
    fingerprint,
    request: {
      prompt: {
        text: buildFxRepairPrompt({
          repository,
          pr,
          head,
          branch,
          check,
          fingerprint,
          failedSteps,
          eventName,
        }),
      },
      source: {
        repository: repoUrl || JOVIE_GITHUB_REPO,
        ref: String(branch || '').trim() || String(head),
      },
      target: {
        autoCreatePr: false,
      },
    },
  };
}
