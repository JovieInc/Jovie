import { describe, expect, it } from 'vitest';
import {
  describeNoAudienceActivity,
  hasAudienceActivity,
} from './audience-activity';

describe('hasAudienceActivity', () => {
  it('is false with no data or all-zero counts', () => {
    expect(hasAudienceActivity(undefined)).toBe(false);
    expect(hasAudienceActivity(null)).toBe(false);
    expect(
      hasAudienceActivity({
        profile_views: 0,
        unique_users: 0,
        subscribers: 0,
        total_clicks: 0,
        listen_clicks: 0,
        tip_link_visits: 0,
      })
    ).toBe(false);
  });

  it('is true as soon as any count is above zero', () => {
    expect(hasAudienceActivity({ profile_views: 1 })).toBe(true);
    expect(hasAudienceActivity({ profile_views: 0, total_clicks: 3 })).toBe(
      true
    );
    expect(hasAudienceActivity({ profile_views: 0, subscribers: 1 })).toBe(
      true
    );
  });
});

describe('describeNoAudienceActivity', () => {
  it('names the selected window', () => {
    expect(describeNoAudienceActivity('7d')).toBe(
      'No one has opened your profile in the last 7 days. Share your link and views, clicks and top sources show up here.'
    );
    expect(describeNoAudienceActivity('30d')).toContain('in the last 30 days');
  });

  it('says yet for the unbounded window', () => {
    expect(describeNoAudienceActivity('all')).toMatch(
      /^No one has opened your profile yet\./
    );
  });
});
