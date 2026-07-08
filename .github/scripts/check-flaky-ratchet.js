#!/usr/bin/env node
/**
 * Flaky-rate ratchet check.
 *
 * Reads the committed ratchet floor from flaky-rate-ratchet.json AND the
 * tracked-flake ledger from apps/web/tests/quarantine.json.  The effective
 * allowed maximum is the GREATER of the two — i.e. known tracked flakes
 * do NOT trigger a failure.  Only NEW untracked flakes cause a ratchet
 * violation.
 *
 * The stored floor may only decrease (improve) over time and serves as the
 * "you must be this low to pass" floor when the quarantine ledger is empty.
 *
 * Usage:
 *   node check-flaky-ratchet.js [flakyCount]
 *   FLAKY_COUNT=3 node check-flaky-ratchet.js
 *   node check-flaky-ratchet.js --update <N>   # lower the floor only
 */

const fs = require('fs');
const path = require('path');

const RATCHET_PATH = path.join(__dirname, 'flaky-rate-ratchet.json');
const QUARANTINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'apps',
  'web',
  'tests',
  'quarantine.json'
);

/**
 * Read the tracked-flake ledger (quarantine.json).
 * Returns the number of entries, or 0 if the file is missing / invalid.
 */
function readTrackedFlakeCount() {
  try {
    const raw = fs.readFileSync(QUARANTINE_PATH, 'utf8');
    const quarantine = JSON.parse(raw);
    const entries = Array.isArray(quarantine.entries) ? quarantine.entries : [];
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Check current flaky count against the ratchet floor.
 *
 * The effective floor is max(stored.floor, trackedFlakeCount) — known
 * quarantined flakes never count as a violation.
 *
 * @param {object} ratchet - parsed ratchet JSON
 * @param {number} flakyCount - current detected flaky test count
 * @param {number} trackedFlakeCount - entries in the quarantine ledger
 * @returns {{ ok: boolean, floor: number, actual: number, tracked: number, message: string }}
 */
function checkRatchet(ratchet, flakyCount, trackedFlakeCount = 0) {
  const effectiveFloor = Math.max(
    ratchet.maxAllowedFlakyTests,
    trackedFlakeCount
  );
  const ok = flakyCount <= effectiveFloor;
  const message = ok
    ? `✅ Ratchet OK: ${flakyCount} flaky tests ≤ effective floor of ${effectiveFloor} (stored=${ratchet.maxAllowedFlakyTests}, tracked=${trackedFlakeCount})`
    : `❌ RATCHET FAIL: ${flakyCount} flaky tests exceeds the effective floor of ${effectiveFloor} (stored=${ratchet.maxAllowedFlakyTests}, tracked=${trackedFlakeCount}). New untracked flakiness has been introduced. Investigate and fix or quarantine.`;
  return {
    ok,
    floor: effectiveFloor,
    storedFloor: ratchet.maxAllowedFlakyTests,
    tracked: trackedFlakeCount,
    actual: flakyCount,
    message,
  };
}

/**
 * Validate a proposed floor update. The floor may only decrease.
 * @param {object} ratchet - current ratchet JSON
 * @param {number} newFloor - proposed new floor value
 * @returns {{ ok: boolean, newFloor: number, message: string }}
 */
function updateRatchet(ratchet, newFloor) {
  if (
    typeof newFloor !== 'number' ||
    !Number.isFinite(newFloor) ||
    newFloor < 0
  ) {
    return {
      ok: false,
      newFloor: ratchet.maxAllowedFlakyTests,
      message: 'Floor must be a non-negative integer',
    };
  }
  if (newFloor >= ratchet.maxAllowedFlakyTests) {
    return {
      ok: false,
      newFloor: ratchet.maxAllowedFlakyTests,
      message: `Rejected: ${newFloor} is not less than the current floor ${ratchet.maxAllowedFlakyTests}. The ratchet floor may only decrease.`,
    };
  }
  return {
    ok: true,
    newFloor,
    message: `Updated floor: ${ratchet.maxAllowedFlakyTests} → ${newFloor}`,
  };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const updateIdx = args.indexOf('--update');

  if (updateIdx !== -1) {
    const raw = args[updateIdx + 1];
    const newFloor = parseInt(raw, 10);
    if (Number.isNaN(newFloor)) {
      console.error('Usage: --update <N>  (N must be a non-negative integer)');
      process.exit(1);
    }
    const ratchet = JSON.parse(fs.readFileSync(RATCHET_PATH, 'utf8'));
    const result = updateRatchet(ratchet, newFloor);
    if (!result.ok) {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
    ratchet.maxAllowedFlakyTests = result.newFloor;
    ratchet.lockedAt = new Date().toISOString().split('T')[0];
    fs.writeFileSync(RATCHET_PATH, JSON.stringify(ratchet, null, 2) + '\n');
    console.log(`✅ ${result.message}`);
    process.exit(0);
  }

  // Check mode
  const flakyCountRaw =
    process.env.FLAKY_COUNT ?? args.find(a => !a.startsWith('-')) ?? '0';
  const flakyCount = parseInt(flakyCountRaw, 10);
  if (Number.isNaN(flakyCount)) {
    console.error(`Invalid flaky count: ${flakyCountRaw}`);
    process.exit(1);
  }

  const ratchet = JSON.parse(fs.readFileSync(RATCHET_PATH, 'utf8'));
  const trackedCount = readTrackedFlakeCount();
  const result = checkRatchet(ratchet, flakyCount, trackedCount);

  console.log(`📊 Flaky-rate ratchet check`);
  console.log(`   Current flaky count   : ${result.actual}`);
  console.log(`   Tracked flakes (ledger): ${result.tracked}`);
  console.log(`   Stored floor           : ${result.storedFloor}`);
  console.log(`   Effective floor        : ${result.floor}`);
  console.log(`\n${result.message}`);

  if (!result.ok) {
    console.error(
      `\n   New untracked flakiness detected. To fix:` +
        `\n   1. Add new flaky tests to quarantine.json` +
        `\n   2. Or deflake them until count ≤ ${result.floor}` +
        `\n   3. Then run: node .github/scripts/check-flaky-ratchet.js --update <newCount>`
    );
    process.exit(1);
  }
}

module.exports = { checkRatchet, updateRatchet };
