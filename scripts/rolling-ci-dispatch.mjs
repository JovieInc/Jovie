#!/usr/bin/env node
import {
  normalizeFailureEvents,
  parseRollingCiState,
  planFailureDispatch,
  renderDispatchComment,
} from './lib/rolling-ci-dispatch.mjs';

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const input = await readInput();
const events = normalizeFailureEvents(input);
let state = parseRollingCiState(input.priorCommentBody);
let finalPlan = null;

for (const event of events) {
  const plan = planFailureDispatch({
    event,
    liveHead: input.liveHead,
    writer: input.writer,
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
  action: finalPlan?.action ?? 'no_failure',
  mutate: Boolean(finalPlan?.mutate),
  state,
  body:
    actionableEvent && state
      ? renderDispatchComment({
          event: actionableEvent,
          plan: { ...finalPlan, state },
        })
      : '',
};

process.stdout.write(`${JSON.stringify(output)}\n`);
