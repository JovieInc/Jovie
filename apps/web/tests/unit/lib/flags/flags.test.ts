/**
 * Feature Flags Tests
 *
 * Tests for the feature flags configuration and types.
 */

import { describe, expect, it } from 'vitest';
import { STATSIG_FLAGS, type StatsigFlagName } from '@/lib/flags';

describe('Feature Flags', () => {
  describe('STATSIG_FLAGS', () => {
    it('should export STATSIG_FLAGS object', () => {
      expect(STATSIG_FLAGS).toBeDefined();
      expect(typeof STATSIG_FLAGS).toBe('object');
    });

    it('should have all flags prefixed with feature_', () => {
      for (const [_key, value] of Object.entries(STATSIG_FLAGS)) {
        expect(value).toMatch(/^feature_/);
      }
    });

    it('should have expected profile feature flags', () => {
      expect(STATSIG_FLAGS.CONTACTS).toBe('feature_contacts');
      expect(STATSIG_FLAGS.DYNAMIC_ENGAGEMENT).toBe(
        'feature_dynamic_engagement'
      );
    });

    it('should have expected backend feature flags', () => {
      expect(STATSIG_FLAGS.AUDIENCE_V2).toBe('feature_audience_v2');
    });

    it('should have expected integration feature flags', () => {
      expect(STATSIG_FLAGS.LINK_INGESTION).toBe('feature_link_ingestion');
    });

    it('should have unique flag values', () => {
      const values = Object.values(STATSIG_FLAGS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have uppercase keys', () => {
      for (const key of Object.keys(STATSIG_FLAGS)) {
        expect(key).toBe(key.toUpperCase());
      }
    });
  });

  describe('StatsigFlagName type', () => {
    it('should allow valid flag names', () => {
      // Type-level test - these should compile without errors
      const contactsFlag: StatsigFlagName = 'feature_contacts';
      const audienceFlag: StatsigFlagName = 'feature_audience_v2';
      const linkIngestionFlag: StatsigFlagName = 'feature_link_ingestion';

      expect(contactsFlag).toBe(STATSIG_FLAGS.CONTACTS);
      expect(audienceFlag).toBe(STATSIG_FLAGS.AUDIENCE_V2);
      expect(linkIngestionFlag).toBe(STATSIG_FLAGS.LINK_INGESTION);
    });
  });
});
