export type AnalyticsRange = '1d' | '7d' | '30d' | '90d' | 'all';

export type DashboardAnalyticsView = 'traffic' | 'full';

export type AnalyticsCityRow = {
  city: string;
  count: number;
};

export type AnalyticsCountryRow = {
  country: string;
  count: number;
};

export type AnalyticsReferrerRow = {
  referrer: string;
  count: number;
};

export type DashboardAnalyticsResponse = {
  profile_views: number;
  unique_users?: number;
  listen_clicks?: number;
  subscribers?: number;
  identified_users?: number;
  /** Capture rate: (subscribers / unique_users) * 100, as a percentage */
  capture_rate?: number;
  top_cities: AnalyticsCityRow[];
  top_countries: AnalyticsCountryRow[];
  top_referrers: AnalyticsReferrerRow[];
  total_clicks?: number;
  spotify_clicks?: number;
  social_clicks?: number;
  recent_clicks?: number;
  view?: DashboardAnalyticsView;
};
