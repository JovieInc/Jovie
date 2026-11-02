#!/usr/bin/env node
// Chat time-to-first-visible-word report: p50/p95 of
// (chat_turns.first_text_at - created_at) in seconds over a window.
// Usage: DATABASE_URL=... node scripts/chat-latency-report.mjs [--hours 24] [--json]
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const hoursIdx = args.indexOf('--hours');
const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) : 24;
if (!Number.isFinite(hours) || hours <= 0) {
  console.error('--hours must be a positive number');
  process.exit(2);
}
const url = (process.env.DATABASE_URL ?? '').replace(
  /^postgres(ql)?\+neon:\/\//,
  'postgres$1://'
);
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const sql = `select count(*)::int as n,
  round((percentile_cont(0.5) within group (order by extract(epoch from first_text_at - created_at)))::numeric, 3) as p50_s,
  round((percentile_cont(0.95) within group (order by extract(epoch from first_text_at - created_at)))::numeric, 3) as p95_s
from chat_turns
where first_text_at is not null and created_at > now() - interval '${hours} hours'`;

const out = execFileSync('psql', [url, '-At', '-F', ',', '-c', sql], {
  encoding: 'utf8',
}).trim();
const [n, p50, p95] = out.split(',');
const result = {
  windowHours: hours,
  turns: Number(n),
  p50Seconds: p50 ? Number(p50) : null,
  p95Seconds: p95 ? Number(p95) : null,
  targetP95Seconds: 2,
};
console.log(
  args.includes('--json')
    ? JSON.stringify(result)
    : `chat time to first visible word (last ${hours}h, n=${result.turns}): p50=${p50 || 'n/a'}s p95=${p95 || 'n/a'}s (target p95 <= 2s)`
);
