#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseRollingCiState, runDispatch } from './rolling-ci-dispatch.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  fxConfigurationIncident,
  parseHandoffReceipt,
  resolveFxAdapter,
  resolveRemediationRoute,
} from './rolling-ci-handoff.mjs';

export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v0/agents';

export function cursorAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

export function findOwnedAgents(agents, fingerprint) {
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return (Array.isArray(agents) ? agents : [])
    .filter(agent =>
      JSON.stringify(agent ?? {})
        .toLowerCase()
        .includes(needle.toLowerCase())
    )
    .map(agent => agent?.id)
    .filter(id => typeof id === 'string' && id.length > 0);
}

/**
 * Webhook ingress: missing handoff routes to FX. Pickup-end
 * `resolveRemediationRoute` still keeps the implementer when no receipt.
 */
export function resolveWebhookRemediationRoute({
  receipt = null,
  liveHead,
  implementer,
  fxAdapter = null,
  now,
} = {}) {
  if (receipt) {
    const pickup = resolveRemediationRoute({
      receipt,
      liveHead,
      implementer,
      fxAdapter,
      now,
    });
    return pickup.route === 'implementer'
      ? { ...pickup, reason: 'implementer_lease_live' }
      : pickup;
  }

  const adapter = resolveFxAdapter(fxAdapter);
  if (!adapter.name || adapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  return {
    route: 'fx',
    writer: adapter.name,
    failure: FX_HANDOFF_FAILURE,
    reason: 'no_handoff_receipt',
  };
}

export function resolveDispatchWriter({
  route,
  priorClaimWriter,
  implementer,
} = {}) {
  if (route?.route === 'implementer') {
    return route.writer || implementer;
  }
  if (route?.route === 'fx') {
    if (priorClaimWriter && priorClaimWriter !== FX_ADAPTER_NAME) {
      return priorClaimWriter;
    }
    return FX_ADAPTER_NAME;
  }
  return implementer;
}

export function buildFxPrompt({
  repository,
  prNumber,
  headSha,
  fingerprint,
  failedChecks = [],
} = {}) {
  return [
    'Repair the current pull request at the exact failed head. Do not open a sibling PR.',
    `Repository: ${repository}`,
    `PR: #${prNumber}`,
    `Exact head: ${headSha}`,
    `Failure fingerprint: ${fingerprint}`,
    failedChecks.length ? `Failed checks: ${failedChecks.join(', ')}` : '',
    'Add or update the smallest regression test. Do not skip drafts. Do not merge.',
    'Do not invent a second fleet hold. Area collision holds only.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function planFxLaunch({
  repository,
  prNumber,
  headSha,
  headRef,
  fingerprint,
  failedChecks = [],
  cursorAgents = [],
  cursorApiKey,
} = {}) {
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'configuration_incident',
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  const owned = findOwnedAgents(cursorAgents, fingerprint);
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      existingAgentIds: owned,
    };
  }
  return {
    action: 'launch',
    reason: 'ci-failed-after-webhook',
    request: {
      prompt: {
        text: buildFxPrompt({
          repository,
          prNumber,
          headSha,
          fingerprint,
          failedChecks,
        }),
      },
      source: {
        repository: `https://github.com/${repository}`,
        ref: headRef || `refs/pull/${prNumber}/head`,
      },
      target: {
        autoCreatePr: false,
        autoBranchOnConflict: false,
        skipReviewerRequest: true,
      },
    },
  };
}

export function planFxWebhookRemediation({
  dispatch,
  receipt = null,
  liveHead,
  implementer,
  fxAdapter,
  cursorAgents = [],
  cursorApiKey = '',
  now,
  repository,
  prNumber,
  headSha,
  headRef,
} = {}) {
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead,
    implementer,
    fxAdapter: fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured: Boolean(String(cursorApiKey ?? '').trim()),
    },
    now,
  });
  const action = dispatch?.action ?? '';
  const isFailureDispatch =
    action === 'dispatch_implementer' ||
    action === 'dispatch_superseding_head' ||
    action === 'reject_competing_writer';

  if (route.route === 'implementer') {
    return {
      dispatch,
      route,
      launch: { action: 'skip', reason: 'implementer_lease_live' },
    };
  }
  if (route.route === 'configuration_incident') {
    return {
      dispatch,
      route,
      launch: {
        action: 'configuration_incident',
        reason: 'fx-auth-missing',
        incident: route.incident,
      },
    };
  }
  if (route.route !== 'fx' || !isFailureDispatch) {
    return {
      dispatch,
      route,
      launch: { action: 'skip', reason: action || route.route },
    };
  }

  return {
    dispatch,
    route,
    launch: planFxLaunch({
      repository: repository ?? dispatch?.events?.[0]?.repository,
      prNumber: prNumber ?? dispatch?.events?.[0]?.pr,
      headSha: headSha ?? liveHead ?? dispatch?.state?.head,
      headRef,
      fingerprint:
        dispatch?.state?.claim?.fingerprint ||
        dispatch?.events?.[0]?.fingerprint ||
        '',
      failedChecks: (dispatch?.events ?? []).map(event => event.check),
      cursorAgents,
      cursorApiKey,
    }),
  };
}

export async function listCursorAgents({
  cursorApiKey,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`cursor list failed: ${response.status}`);
  }
  return Array.isArray(body?.agents) ? body.agents : [];
}

export async function launchCursorAgent({
  request,
  cursorApiKey,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`cursor launch failed: ${response.status}`);
  }
  return body;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const input = await readInput();
  const receipt =
    input.receipt ??
    parseHandoffReceipt(input.handoffCommentBody ?? '') ??
    null;
  const cursorApiKey = input.cursorApiKey ?? process.env.CURSOR_API_KEY ?? '';
  let cursorAgents = Array.isArray(input.cursorAgents)
    ? input.cursorAgents
    : [];
  if (
    cursorApiKey &&
    cursorAgents.length === 0 &&
    input.listCursorAgents !== false
  ) {
    try {
      cursorAgents = await listCursorAgents({ cursorApiKey });
    } catch {
      cursorAgents = [];
    }
  }
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: input.fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured: Boolean(String(cursorApiKey).trim()),
    },
    now: input.now,
  });
  const priorClaimWriter =
    input.priorClaimWriter ||
    parseRollingCiState(input.priorCommentBody)?.claim?.writer;
  const writer = resolveDispatchWriter({
    route,
    priorClaimWriter,
    implementer: input.writer,
  });
  const dispatch = runDispatch({ ...input, writer });
  const result = planFxWebhookRemediation({
    dispatch,
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: input.fxAdapter,
    cursorAgents,
    cursorApiKey,
    now: input.now,
    repository: input.repository,
    prNumber: input.prNumber,
    headSha: input.headSha,
    headRef: input.headRef,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
