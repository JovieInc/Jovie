#!/usr/bin/env node
import {
  normalizeFailureEvents,
  parseRollingCiState,
  planFailureDispatch,
  renderDispatchComment,
} from './lib/rolling-ci-dispatch.mjs';
import {
  parseHandoffReceipt,
  resolveRemediationRoute,
} from './lib/rolling-ci-handoff.mjs';

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const input = await readInput();
const events = normalizeFailureEvents(input);
const ownership = resolveRemediationRoute({
  receipt: parseHandoffReceipt(input.prBody),
  liveHead: input.liveHead,
  implementer: input.implementer,
  fxAdapter: input.fxAdapter,
});
let state = parseRollingCiState(input.priorCommentBody);
let finalPlan = null;

for (const event of ownership.writer ? events : []) {
  const plan = planFailureDispatch({
    event,
    liveHead: input.liveHead,
    writer: ownership.writer,
    priorState: state,
  });
  finalPlan = plan;
  if (plan.mutate) state = plan.state;
}

const actionableEvent = events.find(event =>
  state?.deliveries?.includes(event.delivery)
);
const output = {
  events,
  route: ownership.route,
  action: finalPlan?.action ?? ownership.route,
  mutate: Boolean(finalPlan?.mutate),
  shouldComment:
    Boolean(finalPlan?.mutate) || ownership.route === 'configuration_incident',
  state,
  body:
    actionableEvent && state
      ? renderDispatchComment({
          event: actionableEvent,
          plan: { ...finalPlan, state },
        }) +
        '\n\nBefore this loop is complete, attach the exact-head green learning receipt: root-cause class, reproduction, minimal repair, equivalent-surface sweep, deliberate-red fixture, and scoped guardrail decision.'
      : ownership.route === 'configuration_incident'
        ? '## FX remediation configuration incident\n\nThe PR was handed off or abandoned, but the configured FX adapter authentication is unavailable. Implementer-owned remediation remains unaffected; CI Platform owns restoring the backstop.\n\n**Remedy:** configure the declared FX adapter authentication without exposing it to pull-request code.'
        : '',
};

process.stdout.write(`${JSON.stringify(output)}\n`);
