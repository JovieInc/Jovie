import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';

describe('queryKeys', () => {
  describe('billing', () => {
    it('has correct base key', () => {
      expect(queryKeys.billing.all).toEqual(['billing']);
    });

    it('status() extends base key', () => {
      expect(queryKeys.billing.status()).toEqual(['billing', 'status']);
    });

    it('subscription() extends base key', () => {
      expect(queryKeys.billing.subscription()).toEqual([
        'billing',
        'subscription',
      ]);
    });

    it('invoices() extends base key', () => {
      expect(queryKeys.billing.invoices()).toEqual(['billing', 'invoices']);
    });

    it('pricingOptions() extends base key', () => {
      expect(queryKeys.billing.pricingOptions()).toEqual([
        'billing',
        'pricing-options',
      ]);
    });

    it('all keys start with base key for partial invalidation', () => {
      const status = queryKeys.billing.status();
      const subscription = queryKeys.billing.subscription();

      expect(status.slice(0, 1)).toEqual(queryKeys.billing.all);
      expect(subscription.slice(0, 1)).toEqual(queryKeys.billing.all);
    });
  });

  describe('user', () => {
    it('has correct base key', () => {
      expect(queryKeys.user.all).toEqual(['user']);
    });

    it('profile() extends base key', () => {
      expect(queryKeys.user.profile()).toEqual(['user', 'profile']);
    });

    it('settings() extends base key', () => {
      expect(queryKeys.user.settings()).toEqual(['user', 'settings']);
    });

    it('notifications() extends base key', () => {
      expect(queryKeys.user.notifications()).toEqual(['user', 'notifications']);
    });
  });

  describe('dashboard', () => {
    it('has correct base key', () => {
      expect(queryKeys.dashboard.all).toEqual(['dashboard']);
    });

    it('analytics() without range returns base analytics key', () => {
      expect(queryKeys.dashboard.analytics()).toEqual([
        'dashboard',
        'analytics',
      ]);
    });

    it('analytics() with range includes range in key', () => {
      expect(queryKeys.dashboard.analytics('7d')).toEqual([
        'dashboard',
        'analytics',
        '7d',
      ]);
      expect(queryKeys.dashboard.analytics('30d')).toEqual([
        'dashboard',
        'analytics',
        '30d',
      ]);
    });

    it('links() extends base key', () => {
      expect(queryKeys.dashboard.links()).toEqual(['dashboard', 'links']);
    });

    it('socialLinks() without profileId returns base key', () => {
      expect(queryKeys.dashboard.socialLinks()).toEqual([
        'dashboard',
        'social-links',
      ]);
    });

    it('socialLinks() with profileId includes profileId', () => {
      expect(queryKeys.dashboard.socialLinks('profile-123')).toEqual([
        'dashboard',
        'social-links',
        'profile-123',
      ]);
    });

    it('activityFeed() without params returns base key', () => {
      expect(queryKeys.dashboard.activityFeed()).toEqual([
        'dashboard',
        'activity-feed',
      ]);
    });

    it('activityFeed() with params includes params object', () => {
      expect(queryKeys.dashboard.activityFeed('profile-123', '7d')).toEqual([
        'dashboard',
        'activity-feed',
        { profileId: 'profile-123', range: '7d' },
      ]);
    });
  });

  describe('creators', () => {
    it('has correct base key', () => {
      expect(queryKeys.creators.all).toEqual(['creators']);
    });

    it('list() without filters returns base list key', () => {
      expect(queryKeys.creators.list()).toEqual(['creators', 'list']);
    });

    it('list() with filters includes filters object', () => {
      const filters = { status: 'active', page: 1 };
      expect(queryKeys.creators.list(filters)).toEqual([
        'creators',
        'list',
        filters,
      ]);
    });

    it('detail() includes id', () => {
      expect(queryKeys.creators.detail('creator-123')).toEqual([
        'creators',
        'detail',
        'creator-123',
      ]);
    });

    it('featured() extends base key', () => {
      expect(queryKeys.creators.featured()).toEqual(['creators', 'featured']);
    });

    it('socialLinks() includes profileId', () => {
      expect(queryKeys.creators.socialLinks('profile-123')).toEqual([
        'creators',
        'social-links',
        'profile-123',
      ]);
    });
  });

  describe('dspEnrichment', () => {
    it('has correct base key', () => {
      expect(queryKeys.dspEnrichment.all).toEqual(['dsp-enrichment']);
    });

    it('matches() includes profileId and defaults status to all', () => {
      expect(queryKeys.dspEnrichment.matches('profile-123')).toEqual([
        'dsp-enrichment',
        'matches',
        'profile-123',
        'all',
      ]);
    });

    it('matches() with status includes status', () => {
      expect(
        queryKeys.dspEnrichment.matches('profile-123', 'suggested')
      ).toEqual(['dsp-enrichment', 'matches', 'profile-123', 'suggested']);
    });

    it('matchDetail() includes matchId', () => {
      expect(queryKeys.dspEnrichment.matchDetail('match-456')).toEqual([
        'dsp-enrichment',
        'match',
        'match-456',
      ]);
    });

    it('status() includes profileId', () => {
      expect(queryKeys.dspEnrichment.status('profile-123')).toEqual([
        'dsp-enrichment',
        'status',
        'profile-123',
      ]);
    });

    it('providerData() includes profileId and providerId', () => {
      expect(
        queryKeys.dspEnrichment.providerData('profile-123', 'apple_music')
      ).toEqual(['dsp-enrichment', 'provider', 'profile-123', 'apple_music']);
    });
  });

  describe('profile', () => {
    it('has correct base key', () => {
      expect(queryKeys.profile.all).toEqual(['profile']);
    });

    it('byUsername() includes username', () => {
      expect(queryKeys.profile.byUsername('testartist')).toEqual([
        'profile',
        'username',
        'testartist',
      ]);
    });

    it('links() includes profileId', () => {
      expect(queryKeys.profile.links('profile-123')).toEqual([
        'profile',
        'links',
        'profile-123',
      ]);
    });
  });

  describe('notifications', () => {
    it('has correct base key', () => {
      expect(queryKeys.notifications.all).toEqual(['notifications']);
    });

    it('status() includes normalized params', () => {
      expect(
        queryKeys.notifications.status({
          artistId: 'artist-123',
          email: 'test@example.com',
          phone: null,
        })
      ).toEqual([
        'notifications',
        'status',
        { artistId: 'artist-123', email: 'test@example.com', phone: null },
      ]);
    });

    it('status() normalizes undefined to null', () => {
      expect(
        queryKeys.notifications.status({
          artistId: 'artist-123',
        })
      ).toEqual([
        'notifications',
        'status',
        { artistId: 'artist-123', email: null, phone: null },
      ]);
    });
  });

  describe('handle', () => {
    it('has correct base key', () => {
      expect(queryKeys.handle.all).toEqual(['handle']);
    });

    it('availability() includes lowercase handle', () => {
      expect(queryKeys.handle.availability('TestHandle')).toEqual([
        'handle',
        'availability',
        'testhandle',
      ]);
    });
  });

  describe('releases', () => {
    it('has correct base key', () => {
      expect(queryKeys.releases.all).toEqual(['releases']);
    });

    it('matrix() includes profileId', () => {
      expect(queryKeys.releases.matrix('profile-123')).toEqual([
        'releases',
        'matrix',
        'profile-123',
      ]);
    });

    it('dspStatus() includes releaseId', () => {
      expect(queryKeys.releases.dspStatus('release-456')).toEqual([
        'releases',
        'dsp-status',
        'release-456',
      ]);
    });
  });

  describe('health', () => {
    it('buildInfo() extends base key', () => {
      expect(queryKeys.health.buildInfo()).toEqual(['health', 'build-info']);
    });
  });

  describe('key hierarchy for cache invalidation', () => {
    it('invalidating billing.all would affect all billing queries', () => {
      const baseKey = queryKeys.billing.all;
      const status = queryKeys.billing.status();
      const subscription = queryKeys.billing.subscription();

      // All specific keys should start with the base key
      expect(status[0]).toBe(baseKey[0]);
      expect(subscription[0]).toBe(baseKey[0]);
    });

    it('invalidating dashboard.all would affect all dashboard queries', () => {
      const baseKey = queryKeys.dashboard.all;
      const analytics = queryKeys.dashboard.analytics('7d');
      const socialLinks = queryKeys.dashboard.socialLinks('profile-123');

      expect(analytics[0]).toBe(baseKey[0]);
      expect(socialLinks[0]).toBe(baseKey[0]);
    });

    it('keys are readonly (const assertion)', () => {
      // TypeScript enforces this, but we can verify the structure is as expected
      const key = queryKeys.billing.status();
      expect(Array.isArray(key)).toBe(true);
      expect(key.length).toBe(2);
    });
  });
});
