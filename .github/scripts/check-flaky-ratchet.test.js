const test = require('node:test');
const assert = require('node:assert/strict');

const { checkRatchet, updateRatchet } = require('./check-flaky-ratchet');

// checkRatchet

test('checkRatchet passes when count is at floor', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 2 }, 2);
  assert.equal(result.ok, true);
  assert.equal(result.floor, 2);
  assert.equal(result.actual, 2);
  assert.ok(result.message.includes('✅'));
});

test('checkRatchet passes when count is below floor', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 5 }, 3);
  assert.equal(result.ok, true);
  assert.equal(result.actual, 3);
});

test('checkRatchet fails when count exceeds floor', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 2 }, 3);
  assert.equal(result.ok, false);
  assert.equal(result.floor, 2);
  assert.equal(result.actual, 3);
  assert.ok(result.message.includes('RATCHET FAIL'));
});

test('checkRatchet zero floor means any flaky test fails', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 1);
  assert.equal(result.ok, false);
});

test('checkRatchet zero floor passes with zero flaky tests', () => {
  const result = checkRatchet({ maxAllowedFlakyTests: 0 }, 0);
  assert.equal(result.ok, true);
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
