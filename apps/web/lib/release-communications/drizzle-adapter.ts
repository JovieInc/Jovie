import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  releaseDailyPostDismissals,
  releaseDailyPostEntries,
  releaseDailyPosts,
  releaseMergeEvents,
} from '@/lib/db/schema/release-communications';
import {
  type ChangelogFilter,
  classifyMergeEvent,
  type DailyPost,
  type DailyPostEntry,
  localCalendarDay,
  mergeEventKey,
  type ReleaseApp,
  type ReleaseCommunicationsAdapter,
  type VerifiedMergeEvent,
} from './index';

type Database = typeof db;

/**
 * Postgres-backed adapter for the canonical daily-post contract.
 *
 * Idempotency lives in storage: `release_merge_events.event_key` is unique, so
 * a replayed merge event can never create a second entry; the post identity
 * `(product, app, local_date)` is unique, so same-day merges append to the one
 * rolling post. If a previous ingest crashed after recording the event but
 * before writing its entry, the replay path backfills the missing entry.
 */
export class DrizzleReleaseCommunicationsAdapter
  implements ReleaseCommunicationsAdapter
{
  constructor(
    private readonly database: Database = db,
    private readonly timeZone = 'UTC'
  ) {}

  async ingest(event: VerifiedMergeEvent): Promise<DailyPost> {
    if (!event.verified) throw new Error('merge event must be verified');
    const eventKey = mergeEventKey(event);
    const day = localCalendarDay(event.mergedAt, this.timeZone);

    const [insertedEvent] = await this.database
      .insert(releaseMergeEvents)
      .values({
        eventKey,
        repository: event.repository,
        pullRequestNumber: event.pullRequestNumber,
        mergeSha: event.mergeSha,
        mergedAt: event.mergedAt,
        product: event.product,
        app: event.app,
        payload: event.metadata ?? {},
      })
      .onConflictDoNothing({ target: releaseMergeEvents.eventKey })
      .returning({ id: releaseMergeEvents.id });

    const eventId = insertedEvent?.id ?? (await this.eventIdFor(eventKey))?.id;
    if (!eventId) {
      throw new Error('merge event could not be recorded');
    }

    const post = await this.postFor(event.product, event.app, day);
    await this.ensureEntry(post.id, eventId, event);
    return (await this.getDailyPost({
      product: event.product,
      app: event.app,
      localDate: day,
    })) as DailyPost;
  }

  async getDailyPost(input: {
    product: string;
    app?: ReleaseApp;
    localDate: string;
  }): Promise<DailyPost | null> {
    const conditions = [
      eq(releaseDailyPosts.product, input.product),
      eq(releaseDailyPosts.localDate, input.localDate),
    ];
    if (input.app) conditions.push(eq(releaseDailyPosts.app, input.app));
    const [post] = await this.database
      .select()
      .from(releaseDailyPosts)
      .where(and(...conditions))
      .limit(1);
    if (!post) return null;
    return this.withEntries(post);
  }

  /** Most recent daily post for a product surface, regardless of date. */
  async getLatestDailyPost(input: {
    product: string;
    app?: ReleaseApp;
  }): Promise<DailyPost | null> {
    const conditions = [eq(releaseDailyPosts.product, input.product)];
    if (input.app) conditions.push(eq(releaseDailyPosts.app, input.app));
    const [post] = await this.database
      .select()
      .from(releaseDailyPosts)
      .where(and(...conditions))
      .orderBy(desc(releaseDailyPosts.localDate), desc(releaseDailyPosts.id))
      .limit(1);
    if (!post) return null;
    return this.withEntries(post);
  }

  /**
   * Consolidated changelog across products and source repositories. A
   * `repository` or `app` filter also scopes the returned entries to that
   * source; posts left with no matching entries are omitted when a
   * repository filter is applied.
   */
  async listChangelog(filter: ChangelogFilter): Promise<readonly DailyPost[]> {
    const conditions = [];
    if (filter.product)
      conditions.push(eq(releaseDailyPosts.product, filter.product));
    if (filter.app) conditions.push(eq(releaseDailyPosts.app, filter.app));
    if (filter.localDate)
      conditions.push(eq(releaseDailyPosts.localDate, filter.localDate));
    const posts = await this.database
      .select()
      .from(releaseDailyPosts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(releaseDailyPosts.localDate), desc(releaseDailyPosts.id));
    const withEntries = await Promise.all(
      posts.map(post => this.withEntries(post, filter))
    );
    return filter.repository
      ? withEntries.filter(post => post.entries.length > 0)
      : withEntries;
  }

  async dismissPost(input: { postId: string; userId: string }): Promise<void> {
    await this.database
      .insert(releaseDailyPostDismissals)
      .values({ postId: input.postId, userId: input.userId })
      .onConflictDoNothing();
  }

  async isPostDismissed(input: {
    postId: string;
    userId: string;
  }): Promise<boolean> {
    const [row] = await this.database
      .select({ id: releaseDailyPostDismissals.id })
      .from(releaseDailyPostDismissals)
      .where(
        and(
          eq(releaseDailyPostDismissals.postId, input.postId),
          eq(releaseDailyPostDismissals.userId, input.userId)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  private async eventIdFor(eventKey: string) {
    const [row] = await this.database
      .select({ id: releaseMergeEvents.id })
      .from(releaseMergeEvents)
      .where(eq(releaseMergeEvents.eventKey, eventKey))
      .limit(1);
    return row ?? null;
  }

  private async postFor(product: string, app: ReleaseApp, localDate: string) {
    const [post] = await this.database
      .insert(releaseDailyPosts)
      .values({ product, app, localDate })
      .onConflictDoUpdate({
        target: [
          releaseDailyPosts.product,
          releaseDailyPosts.app,
          releaseDailyPosts.localDate,
        ],
        set: { localDate },
      })
      .returning();
    return post;
  }

  private async ensureEntry(
    postId: string,
    eventId: string,
    event: VerifiedMergeEvent
  ) {
    const [existing] = await this.database
      .select({ id: releaseDailyPostEntries.id })
      .from(releaseDailyPostEntries)
      .where(eq(releaseDailyPostEntries.eventId, eventId))
      .limit(1);
    if (existing) return;

    await this.database.insert(releaseDailyPostEntries).values({
      postId,
      eventId,
      repository: event.repository,
      app: event.app,
      pullRequestNumber: event.pullRequestNumber,
      mergeSha: event.mergeSha,
      title: event.title,
      body: event.body ?? null,
      url: event.url ?? null,
      ...classifyMergeEvent(event),
      payload: event.metadata ?? {},
    });
  }

  private async withEntries(
    post: typeof releaseDailyPosts.$inferSelect,
    filter: Pick<ChangelogFilter, 'repository' | 'app'> = {}
  ): Promise<DailyPost> {
    const conditions = [eq(releaseDailyPostEntries.postId, post.id)];
    if (filter.repository)
      conditions.push(
        eq(releaseDailyPostEntries.repository, filter.repository)
      );
    if (filter.app)
      conditions.push(eq(releaseDailyPostEntries.app, filter.app));
    const rows = await this.database
      .select()
      .from(releaseDailyPostEntries)
      .where(and(...conditions))
      .orderBy(releaseDailyPostEntries.createdAt);

    const entries: DailyPostEntry[] = rows.map(row => ({
      id: row.id,
      eventKey: mergeEventKey(row),
      repository: row.repository,
      pullRequestNumber: row.pullRequestNumber,
      mergeSha: row.mergeSha,
      app: row.app,
      title: row.title,
      body: row.body,
      url: row.url,
      material: row.material,
      audienceEligible: row.audienceEligible,
      metadata: row.payload,
    }));

    return {
      id: post.id,
      product: post.product,
      app: post.app,
      localDate: post.localDate,
      entries,
    };
  }
}
