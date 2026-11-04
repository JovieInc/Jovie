#!/usr/bin/env node
// Scheduled-job inventory from canon/automation-registry.jsonl: interval, runs
// per day and the shared scheduler each timer registers into. Read-only.
//   node scripts/automation-schedule-inventory.mjs [--json]
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  loadRegistry,
  loadSchedulers,
  runsPerDay,
  TIMER_KINDS,
} from './lib/automation-registry.mjs';

export function buildInventory(registry, schedulers) {
  const grandfathered = new Set(schedulers.grandfathered ?? []);
  const rows = (registry.entries ?? [])
    .filter(
      entry =>
        entry.status === 'live' && TIMER_KINDS.includes(entry.trigger?.kind)
    )
    .map(entry => ({
      id: entry.id,
      host: entry.host,
      kind: entry.trigger.kind,
      schedule: entry.trigger.schedule ?? '',
      runsPerDay: runsPerDay(entry.trigger.schedule ?? ''),
      scheduler: entry.clock?.scheduler ?? null,
      whyNotEvent: entry.clock?.whyNotEvent ?? null,
      grandfathered: grandfathered.has(entry.id),
    }));
  const byHost = {};
  for (const row of rows) {
    // A lanes clock is a task inside the Gem tick, not a timer of its own.
    if (row.kind === 'lanes-clock') continue;
    const slot = (byHost[row.host] ??= { jobs: 0, runsPerDay: 0, unknown: 0 });
    slot.jobs += 1;
    if (row.runsPerDay === null) slot.unknown += 1;
    else slot.runsPerDay += row.runsPerDay;
  }
  return { rows, byHost };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const inventory = buildInventory(loadRegistry(root), loadSchedulers(root));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log('| id | host | kind | schedule | runs/day | scheduler |');
    console.log('|---|---|---|---|---|---|');
    for (const row of inventory.rows)
      console.log(
        `| ${row.id} | ${row.host} | ${row.kind} | ${row.schedule.replace(/\|/g, '/')} | ${row.runsPerDay ?? '?'} | ${row.scheduler ?? (row.grandfathered ? '(grandfathered)' : 'MISSING')} |`
      );
    console.log('\n| host | timer jobs | runs/day | unparsed |');
    console.log('|---|---|---|---|');
    for (const [host, slot] of Object.entries(inventory.byHost))
      console.log(
        `| ${host} | ${slot.jobs} | ${Math.round(slot.runsPerDay)} | ${slot.unknown} |`
      );
  }
}
