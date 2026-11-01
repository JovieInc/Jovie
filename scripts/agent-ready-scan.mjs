#!/usr/bin/env node
// Usage: node scripts/agent-ready-scan.mjs [--url https://jov.ie] [--json]
// Exit 1 when a check in apps/web/lib/agent-ready/agent-ready-floor.json regressed,
// 2 when the scanner itself is unreachable (unknown, not a defect).
import { readFileSync } from 'node:fs';
import {
  compareToFloor,
  flattenScan,
  runScan,
} from '../apps/web/lib/agent-ready/scan.mjs';

const args = process.argv.slice(2);
const url = args.includes('--url')
  ? args[args.indexOf('--url') + 1]
  : 'https://jov.ie';
const floor = JSON.parse(
  readFileSync(
    new URL(
      '../apps/web/lib/agent-ready/agent-ready-floor.json',
      import.meta.url
    ),
    'utf8'
  )
);
let scan;
try {
  scan = await runScan(url);
} catch (error) {
  console.error(`agent-ready-scan unavailable: ${error.message}`);
  process.exit(2);
}
const statuses = flattenScan(scan);
const { regressions, improvements } = compareToFloor(statuses, floor);
const report = {
  scannedAt: scan.scannedAt,
  checkedAt: new Date().toISOString(),
  url,
  level: scan.level,
  statuses,
  regressions,
  improvements,
};
console.log(JSON.stringify(report, null, args.includes('--json') ? 0 : 2));
process.exit(regressions.length ? 1 : 0);
