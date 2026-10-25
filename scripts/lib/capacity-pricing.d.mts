export interface ListPrice {
  readonly inUsdPerMTok: number;
  readonly outUsdPerMTok: number;
  readonly cachedUsdPerMTok: number | null;
  readonly model: string;
  readonly channel: string;
}
export interface Task {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedTokens?: number;
}
export interface Seat {
  readonly usedPercent: number | null;
  readonly elapsedPercent: number | null;
  readonly usableQuotaApiUsd: number | null;
  readonly planWindowUsd: number | null;
  readonly status?: string;
}
export interface PathRow {
  readonly id: string;
  readonly model: string;
  readonly accessPath: 'api' | 'credits' | 'subscription';
  readonly modelRegistryId: string;
  readonly provider?: string;
  readonly accounts?: readonly string[];
  readonly funding?: string;
  readonly usableQuotaApiUsd?: number | null;
  readonly usableQuotaNote?: string;
}
export interface PricedPath {
  readonly id: string;
  readonly accessPath: string;
  readonly usd: number | null;
  readonly apiUsd?: number;
  readonly baseUsd?: number;
  readonly class: string;
  readonly routable: boolean;
  readonly reason: string;
  readonly funding?: string | null;
}
export function apiListUsd(prices: ListPrice | { inUsdPerMTok: number; outUsdPerMTok: number; cachedUsdPerMTok?: number | null }, task: Task): number;
export function listPrices(modelRegistry: { models?: readonly Record<string, unknown>[] }): Record<string, ListPrice>;
export function subscriptionMarginal(apiUsd: number, seat: Seat, options?: { floorFraction?: number; band?: number }): Omit<PricedPath, 'id' | 'accessPath'>;
export function priceTask(row: PathRow, prices: Record<string, ListPrice>, task: Task, seat?: Seat, options?: { floorFraction?: number; band?: number }): PricedPath;
export function rankPaths(priced: readonly PricedPath[]): PricedPath[];
