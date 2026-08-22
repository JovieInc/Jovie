#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  dispatchStateMarker,
  MAX_NON_PROGRESS_DELIVERIES,
  normalizeFailureEvents,
  normalizeGreenEvent,
  parseDispatchState,
  planFailureDispatch,
  planGreenRecovery,
} from './lib/rolling-ci-dispatch.mjs';

function renderFailureComment({ events, state, incidents }) {
  const lines = [
    '## Trusted rolling CI failure event',
    '',
    `- PR: #${events[0].pr}`,
    `- Exact head: \`${events[0].head}\``,
    `- Workflow run: ${events[0].workflowRunId} (attempt ${events[0].attempt})`,
    `- Trusted policy: \`${events[0].source.workflowPath}@${events[0].source.policySha}\``,
    '',
    '### Failed checks',
    '',
  ];

  for (const event of events) {
    const steps = event.failedSteps.length
      ? `; failed steps: ${event.failedSteps.join(', ')}`
      : '';
    lines.push(`- \`${event.check}\` → \`${event.fingerprint}\`${steps}`);
  }

  if (incidents.length) {
    lines.push('', '### Terminal configuration incident', '');
    for (const incident of incidents) {
      lines.push(
        `- \`${incident.check}\` repeated ${incident.attempts} times without new evidence. ${incident.remedy}`
      );
    }
  } else {
    lines.push(
      '',
      `Dispatch is exact-head and idempotent. A new commit or green rerun supersedes this state; unchanged evidence is bounded at ${MAX_NON_PROGRESS_DELIVERIES} deliveries.`,
      '',
      'This event is normalized only. The ownership controller must acquire the existing one-writer lease before repair.'
    );
  }

  lines.push('', dispatchStateMarker(state));
  return lines.join('\n');
}

function renderGreenComment({ event, state }) {
  return [
    '## Rolling CI repair state superseded',
    '',
    `The exact current head \`${event.head}\` completed CI successfully. Obsolete failure deliveries for this PR are cancelled and must not be repaired.`,
    '',
    dispatchStateMarker(state),
  ].join('\n');
}

export function planRollingCiDispatch(input) {
  const priorState = parseDispatchState(input.priorCommentBody);
  const conclusion = String(input.conclusion ?? input.source?.conclusion ?? '');

  if (conclusion === 'success') {
    const event = normalizeGreenEvent(input);
    const plan = planGreenRecovery({
      event,
      liveHead: input.liveHead,
      priorState,
    });
    return {
      events: [event],
      actions: [plan.action],
      action: plan.action,
      mutate: plan.mutate,
      shouldDispatch: false,
      shouldComment: plan.mutate,
      state: plan.state,
      body: plan.mutate ? renderGreenComment({ event, state: plan.state }) : '',
    };
  }

  if (conclusion !== 'failure') {
    throw new Error(
      `unsupported workflow conclusion: ${conclusion || 'missing'}`
    );
  }

  const events = normalizeFailureEvents(input);
  const plans = [];
  let state = priorState;
  for (const event of events) {
    const plan = planFailureDispatch({
      event,
      liveHead: input.liveHead,
      priorState: state,
    });
    plans.push(plan);
    if (plan.mutate) state = plan.state;
  }

  const dispatchEvents = events.filter(
    (_event, index) => plans[index].dispatch
  );
  const incidents = plans.flatMap(plan =>
    plan.incident ? [plan.incident] : []
  );
  const mutate = plans.some(plan => plan.mutate);
  const shouldComment = mutate;
  const action = incidents.length
    ? 'terminal_configuration_incident'
    : dispatchEvents.length
      ? plans.find(plan => plan.dispatch)?.action
      : plans[0]?.action;

  return {
    events,
    actions: plans.map(plan => plan.action),
    action,
    mutate,
    shouldDispatch: dispatchEvents.length > 0,
    shouldComment,
    state,
    incidents,
    body: shouldComment
      ? renderFailureComment({ events, state, incidents })
      : '',
  };
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const input = await readInput();
  process.stdout.write(`${JSON.stringify(planRollingCiDispatch(input))}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch(error => {
    process.stderr.write(`rolling-ci-dispatch: ${error.message}\n`);
    process.exitCode = 1;
  });
}
