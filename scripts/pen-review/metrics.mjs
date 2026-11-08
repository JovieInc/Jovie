import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import manifest from '../../docs/metrics/stage-manifest.json' with {
  type: 'json',
};
import {
  computeStageTimings,
  parseStageEventFeed,
  validateStageEvent,
} from '../lib/stage-events.mjs';

/** Publish the existing review observations in the canonical timing contract. */
export function recordTiming(path, event) {
  const row = {
    ...event,
    schema: 'jovie-stage-event/v1',
    entityType: 'pen-review',
    entityId: `${event.frame}:${event.startedAt}:${event.round ?? 'frame'}`,
    enteredAt: event.startedAt,
    exitedAt: event.finishedAt,
    actor: 'pen-review',
    outcome: ['fail', 'error'].includes(event.verdict ?? event.action)
      ? 'failed'
      : 'completed',
    sourceReceipt: path,
  };
  const rows = [row];
  if (row.stage === 'pen-review-frame')
    rows.push({
      ...row,
      stage: 'finished',
      enteredAt: row.exitedAt,
      exitedAt: null,
    });
  for (const observation of rows) {
    const errors = validateStageEvent(observation, manifest);
    if (errors.length) throw new Error(errors.join('; '));
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${rows.map(r => JSON.stringify(r)).join('\n')}\n`);
  const { events, rejected } = parseStageEventFeed(
    readFileSync(path, 'utf8'),
    manifest
  );
  const snapshot = join(dirname(path), 'stage-timings-latest.json');
  const temporary = `${snapshot}.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({
      ...computeStageTimings(events, manifest),
      rejected: rejected.length,
    })
  );
  renameSync(temporary, snapshot);
}
