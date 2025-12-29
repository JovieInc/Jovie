/**
 * Unit tests for Sentry Lazy Replay Module
 *
 * These tests verify the lazy replay loading and SDK upgrade
 * state tracking functions.
 *
 * @module tests/unit/lib/sentry/lazy-replay.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Import lazy-replay functions
import {
  _resetUpgradeStateForTesting,
  getUpgradeState,
  isUpgraded,
  isUpgrading,
} from '@/lib/sentry/lazy-replay';

// ============================================================================
// Upgrade State Tracking Tests
// ============================================================================

describe('Sentry Lazy Replay State Tracking', () => {
  beforeEach(() => {
    _resetUpgradeStateForTesting();
  });

  afterEach(() => {
    _resetUpgradeStateForTesting();
  });

  describe('getUpgradeState', () => {
    it('should return "idle" initially', () => {
      expect(getUpgradeState()).toBe('idle');
    });
  });

  describe('isUpgrading', () => {
    it('should return false initially', () => {
      expect(isUpgrading()).toBe(false);
    });
  });

  describe('isUpgraded', () => {
    it('should return false initially', () => {
      expect(isUpgraded()).toBe(false);
    });
  });

  describe('_resetUpgradeStateForTesting', () => {
    it('should reset state to "idle"', () => {
      _resetUpgradeStateForTesting();
      expect(getUpgradeState()).toBe('idle');
    });

    it('should reset isUpgrading to false', () => {
      _resetUpgradeStateForTesting();
      expect(isUpgrading()).toBe(false);
    });

    it('should reset isUpgraded to false', () => {
      _resetUpgradeStateForTesting();
      expect(isUpgraded()).toBe(false);
    });
  });
});

// ============================================================================
// State Consistency Tests
// ============================================================================

describe('State Consistency', () => {
  beforeEach(() => {
    _resetUpgradeStateForTesting();
  });

  it('should have consistent initial state', () => {
    expect(getUpgradeState()).toBe('idle');
    expect(isUpgrading()).toBe(false);
    expect(isUpgraded()).toBe(false);
  });

  it('should maintain state after multiple resets', () => {
    _resetUpgradeStateForTesting();
    _resetUpgradeStateForTesting();
    _resetUpgradeStateForTesting();

    expect(getUpgradeState()).toBe('idle');
    expect(isUpgrading()).toBe(false);
    expect(isUpgraded()).toBe(false);
  });
});
