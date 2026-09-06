export const RELEASE_COMMUNICATIONS_CONTRACT_VERSION = 'release-communications/v1' as const;
export type ReleaseApp = 'web' | 'ios' | 'electron' | (string & {});

export interface VerifiedMergeEvent {
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly mergeSha: string;
  readonly mergedAt: Date;
  readonly app: ReleaseApp;
  readonly product: string;
  readonly title: string;
  readonly body?: string | null;
  readonly url?: string | null;
  readonly verified: true;
  readonly material?: boolean;
  readonly audienceEligible?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
export interface DailyPostEntry {
  readonly id: string; readonly eventKey: string; readonly repository: string;
  readonly pullRequestNumber: number; readonly mergeSha: string; readonly app: ReleaseApp;
  readonly title: string; readonly body: string | null; readonly url: string | null;
  readonly material: boolean; readonly audienceEligible: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface DailyPost {
  readonly id: string; readonly product: string; readonly app: ReleaseApp;
  readonly localDate: string; readonly entries: readonly DailyPostEntry[];
}
export interface ReleaseCommunicationsAdapter {
  ingest(event: VerifiedMergeEvent): Promise<DailyPost>;
  getDailyPost(input: { product: string; app?: ReleaseApp; localDate: string }): Promise<DailyPost | null>;
  dismissPost(input: { postId: string; userId: string }): Promise<void>;
  isPostDismissed(input: { postId: string; userId: string }): Promise<boolean>;
}
export function mergeEventKey(event: Pick<VerifiedMergeEvent, 'repository' | 'pullRequestNumber' | 'mergeSha'>): string {
  return `${event.repository}#${event.pullRequestNumber}@${event.mergeSha}`;
}
export function localCalendarDay(date: Date, timeZone: string): string {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function classifyMergeEvent(event: VerifiedMergeEvent): Pick<DailyPostEntry, 'material' | 'audienceEligible'> {
  return { material: event.material ?? true, audienceEligible: event.audienceEligible ?? (event.material ?? true) };
}

export class InMemoryReleaseCommunicationsAdapter implements ReleaseCommunicationsAdapter {
  private readonly events = new Map<string, DailyPostEntry>();
  private readonly posts = new Map<string, DailyPost>();
  private readonly dismissals = new Set<string>();
  private sequence = 0;
  constructor(private readonly timeZone = 'UTC') {}
  async ingest(event: VerifiedMergeEvent): Promise<DailyPost> {
    if (!event.verified) throw new Error('merge event must be verified');
    const eventKey = mergeEventKey(event); const day = localCalendarDay(event.mergedAt, this.timeZone);
    const existing = this.events.get(eventKey);
    if (existing) return this.postFor(event.product, event.app, day);
    const key = `${event.product}:${event.app}:${day}`;
    const post = this.posts.get(key) ?? { id: `post-${++this.sequence}`, product: event.product, app: event.app, localDate: day, entries: [] };
    const entry: DailyPostEntry = { id: `entry-${++this.sequence}`, eventKey, repository: event.repository, pullRequestNumber: event.pullRequestNumber, mergeSha: event.mergeSha, app: event.app, title: event.title, body: event.body ?? null, url: event.url ?? null, ...classifyMergeEvent(event), metadata: event.metadata ?? {} };
    this.events.set(eventKey, entry); const nextPost = { ...post, entries: [...post.entries, entry] }; this.posts.set(key, nextPost); return nextPost;
  }
  async getDailyPost(input: { product: string; app?: ReleaseApp; localDate: string }): Promise<DailyPost | null> {
    return [...this.posts.values()].find(post => post.product === input.product && post.localDate === input.localDate && (!input.app || post.app === input.app)) ?? null;
  }
  async dismissPost(input: { postId: string; userId: string }): Promise<void> { this.dismissals.add(`${input.postId}:${input.userId}`); }
  async isPostDismissed(input: { postId: string; userId: string }): Promise<boolean> { return this.dismissals.has(`${input.postId}:${input.userId}`); }
  private postFor(product: string, app: ReleaseApp, day: string): DailyPost { const post = this.posts.get(`${product}:${app}:${day}`); if (!post) throw new Error('deduplicated merge event has no daily post'); return post; }
}
