#!/usr/bin/env node
/**
 * Flaky-rate ratchet check.
 *
 * Reads the committed ratchet floor from flaky-rate-ratchet.json and
 * compares against the current flaky test count. Fails when count > floor
 * (new untracked flakiness introduced). The floor may only decrease.
 *
 * Usage:
 *   node check-flaky-ratchet.js [flakyCount]
 *   FLAKY_COUNT=3 node check-flaky-ratchet.js
 *   node check-flaky-ratchet.js --update <N>   # lower the floor only
 */

const fs = require('fs');
const path = require('path');

const RATCHET_PATH = path.join(__dirname, 'flaky-rate-ratchet.json');

/**
 * Check current flaky count against the ratchet floor.
 * @param {object} ratchet - parsed ratchet JSON
 * @param {number} flakyCount - current detected flaky test count
 * @returns {{ ok: boolean, floor: number, actual: number, message: string }}
 */
function checkRatchet(ratchet, flakyCount) {
  const ok = flakyCount <= ratchet.maxAllowedFlakyTests;
  const floor = ratchet.maxAllowedFlakyTests;
  const message = ok
    ? `✅ Ratchet OK: ${flakyCount} flaky tests ≤ floor of ${floor}`
    : `❌ RATCHET FAIL: ${flakyCount} flaky tests exceeds the floor of ${floor}. New flakiness has been introduced. Investigate and fix or quarantine before the floor can grow.`;
  return { ok, floor, actual: flakyCount, message };
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
  const result = checkRatchet(ratchet, flakyCount);

  console.log(`📊 Flaky-rate ratchet check`);
  console.log(`   Current flaky count : ${result.actual}`);
  console.log(`   Allowed floor        : ${result.floor}`);
  console.log(`\n${result.message}`);

  if (!result.ok) {
    console.error(
      `\n   To fix: deflake tests until count ≤ ${result.floor},` +
        ` then run: node .github/scripts/check-flaky-ratchet.js --update <newCount>`
    );
    process.exit(1);
  }
}

module.exports = { checkRatchet, updateRatchet };
