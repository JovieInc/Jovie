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
  top_cities: AnalyticsCityRow[];
  top_countries: AnalyticsCountryRow[];
  top_referrers: AnalyticsReferrerRow[];
  total_clicks?: number;
  spotify_clicks?: number;
  social_clicks?: number;
  recent_clicks?: number;
  view?: DashboardAnalyticsView;
};
