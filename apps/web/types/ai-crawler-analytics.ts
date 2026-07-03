export interface AiCrawlerStat {
  readonly id: string;
  readonly name: string;
  readonly requests: number;
  readonly previousPeriodRequests: number;
}

export interface AiCrawlerDailyPoint {
  readonly date: string;
  readonly requests: number;
}

export interface AiCrawlerAnalyticsResponse {
  readonly totalRequests: number;
  readonly weeklyRequests: number;
  readonly crawlers: readonly AiCrawlerStat[];
  readonly dailyTrend: readonly AiCrawlerDailyPoint[];
  readonly syncedAt: string | null;
  readonly isPro: boolean;
  readonly isTeaser: boolean;
}