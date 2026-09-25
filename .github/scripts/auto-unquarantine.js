#!/usr/bin/env node

/**
 * Auto-Unquarantine Tests
 *
 * Superseded by update-quarantine.js, which performs quarantine,
 * un-quarantine (>= 7 stable days or >= 50 clean report windows), and pruning
 * in one pass against the schemaVersion-1 ledger at
 * apps/web/tests/quarantine.json. This entrypoint is kept for existing
 * callers and delegates to that implementation.
 *
 * Usage:
 *   node auto-unquarantine.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

function main() {
  const script = path.join(__dirname, 'update-quarantine.js');
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = {};
