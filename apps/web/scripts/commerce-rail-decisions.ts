import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compileRailDecisions } from '../lib/billing/commerce/rail-decisions';

const { values } = parseArgs({
  options: {
    access: { type: 'string' },
    accounts: { type: 'string' },
    at: { type: 'string' },
    matrix: { type: 'string' },
  },
});
if (!values.matrix) throw new Error('--matrix is required');
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function readAccess(path?: string): unknown {
  if (!path) return null;
  try {
    return readJson(path);
  } catch {
    // Unreadable, absent or malformed evidence never becomes an access grant.
    return null;
  }
}
const result = compileRailDecisions(
  readJson(values.matrix),
  readAccess(values.access),
  values.accounts ? readJson(values.accounts) : { openai: null, stripe: null },
  values.at ? new Date(values.at) : new Date()
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
