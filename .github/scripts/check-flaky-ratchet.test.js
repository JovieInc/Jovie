const test = require('node:test');
const assert = require('node:assert/strict');

const { checkRatchet, updateRatchet } = require('./check-flaky-ratchet');

// checkRatchet

test('checkRatchet passes when count is at floor (no tracked flakes)', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 2 }, 2, 0);
  assert.equal(result.ok, true);
  assert.equal(result.floor, 2);
  assert.equal(result.actual, 2);
  assert.ok(result.message.includes('✅'));
});

test('checkRatchet passes when count is below floor', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 5 }, 3, 0);
  assert.equal(result.ok, true);
  assert.equal(result.actual, 3);
});

test('checkRatchet fails when count exceeds floor', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 2 }, 3, 0);
  assert.equal(result.ok, false);
  assert.equal(result.floor, 2);
  assert.equal(result.actual, 3);
  assert.ok(result.message.includes('RATCHET FAIL'));
});

test('checkRatchet zero floor means any flaky test fails (no tracked)', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 1, 0);
  assert.equal(result.ok, false);
});

test('checkRatchet zero floor passes with zero flaky tests', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 0, 0);
  assert.equal(result.ok, true);
});

// Tracked-flake ledger tests

test('checkRatchet uses tracked flake count as effective floor when higher', () => {
  // stored=0, tracked=5, actual=5 -> passes (effective floor is 5)
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 5, 5);
  assert.equal(result.ok, true);
  assert.equal(result.floor, 5);
  assert.equal(result.tracked, 5);
});

test('checkRatchet fails when flaky count exceeds tracked + stored', () => {
  // stored=0, tracked=5, actual=7 -> fails (6 > 5)
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 7, 5);
  assert.equal(result.ok, false);
  assert.equal(result.floor, 5);
  assert.equal(result.actual, 7);
});

test('checkRatchet uses stored floor when it exceeds tracked count', () => {
  // stored=10, tracked=5, actual=8 -> passes (effective floor is 10)
  const result = checkRatchet({ maxAllowedFlakyTests: 10 }, 8, 5);
  assert.equal(result.ok, true);
  assert.equal(result.floor, 10);
});

test('checkRatchet passes at boundary with tracked flakes', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 7, 7);
  assert.equal(result.ok, true);
  assert.equal(result.floor, 7);
});

// updateRatchet

test('updateRatchet accepts a strictly lower floor', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 3 }, 2);
  assert.equal(result.ok, true);
  assert.equal(result.newFloor, 2);
  assert.ok(result.message.includes('3 →'));
});

test('updateRatchet rejects equal floor', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 2 }, 2);
  assert.equal(result.ok, false);
  assert.ok(result.message.includes('may only decrease'));
});

test('updateRatchet rejects higher floor', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 2 }, 5);
  assert.equal(result.ok, false);
  assert.equal(result.newFloor, 2); // unchanged
});

test('updateRatchet rejects non-numeric value', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 3 }, NaN);
  assert.equal(result.ok, false);
});

test('updateRatchet rejects negative floor', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 3 }, -1);
  assert.equal(result.ok, false);
});

test('updateRatchet accepts zero (deflaked all tests)', () => {
  const result = updateRatchet({ maxAllowedFlakyTests: 1 }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.newFloor, 0);
});
