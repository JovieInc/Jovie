import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRetouchImageTool } from '@/lib/chat/tools/retouch-image';
import { db } from '@/lib/db';
import { retouchJobs } from '@/lib/db/schema/agents';
import { users } from '@/lib/db/schema/auth';
import { setupDatabaseBeforeAll } from '../setup-db';

/**
 * Outcome check for chat's retouch ask (chat-retouch, JOV-14474), registered
 * in docs/product/outcome-coverage.json. "Retouch this photo" must hand back
 * a stored result and leave a finished job, and the daily limit must hold
 * without failed tries using it up. Only the image model and the blob store
 * are stubbed: the job lifecycle, the budget count and the database writes
 * are real. Costs nothing to run.
 */

const { runRetouchModelMock, blobStore } = vi.hoisted(() => ({
  runRetouchModelMock: vi.fn(),
  blobStore: new Map<string, Buffer>(),
}));

const BLOB_HOST = 'https://outcome-test.public.blob.vercel-storage.com';
const SOURCE_URL = `${BLOB_HOST}/chat/attachments/press-shot.jpg`;

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', async importOriginal => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureException: vi.fn(),
}));
vi.mock('@/lib/services/retouching/provider-gemini', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/services/retouching/provider-gemini')
  >()),
  isRetouchConfigured: () => true,
  runRetouchModel: runRetouchModelMock,
}));
vi.mock('@/lib/blob-config', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/blob-config')>()),
  isBlobStorageConfigured: () => true,
  getBlobCommandOptions: () => ({}),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: Buffer) => {
    blobStore.set(path, Buffer.from(body));
    return { url: `${BLOB_HOST}/${path}` };
  }),
}));

setupDatabaseBeforeAll();

const createdUserIds: string[] = [];

afterEach(async () => {
  blobStore.clear();
  runRetouchModelMock.mockReset();
  if (createdUserIds.length > 0) {
    // retouch_jobs rows go with their user (on delete cascade).
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
});

async function createArtist(): Promise<string> {
  const suffix = randomUUID().slice(0, 12);
  const [user] = await db
    .insert(users)
    .values({
      clerkId: `integration_retouch_${suffix}`,
      email: `integration-retouch-${suffix}@example.com`,
      userStatus: 'active',
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

type RetouchResult = {
  success: boolean;
  state?: string;
  errorCode?: string;
  jobId?: string;
  resultUrl?: string;
};

function retouchTool(
  userId: string,
  options: { dailyLimit?: number | null; sourceImageUrl?: string | null } = {}
) {
  return createRetouchImageTool({
    profileId: randomUUID(),
    // The tool reads only these two entitlement fields.
    entitlements: {
      canAccessAiRetouching: true,
      aiRetouchDailyLimit: options.dailyLimit ?? null,
    } as never,
    clerkUserId: userId,
    sourceImageUrl:
      options.sourceImageUrl === undefined
        ? SOURCE_URL
        : options.sourceImageUrl,
    conversationId: null,
  }).execute as unknown as (
    input: Record<string, unknown>
  ) => Promise<RetouchResult>;
}

function retouchedImage() {
  return {
    image: Buffer.from('retouched-jpeg-bytes'),
    mediaType: 'image/jpeg',
    model: 'stub-retouch-model',
    tokenUsage: { inputTokens: 1, outputTokens: 1 },
  };
}

async function jobsFor(userId: string) {
  return db
    .select({
      id: retouchJobs.id,
      status: retouchJobs.status,
      sourceAssetId: retouchJobs.sourceAssetId,
      resultAssetId: retouchJobs.resultAssetId,
      perImageOverride: retouchJobs.perImageOverride,
    })
    .from(retouchJobs)
    .where(eq(retouchJobs.userId, userId));
}

describe('chat retouch (outcome)', () => {
  it('a photo retouched in chat comes back as a stored result on a finished job', async () => {
    runRetouchModelMock.mockResolvedValue(retouchedImage());
    const userId = await createArtist();

    const result = await retouchTool(userId)({
      instructions: 'warmer skin, keep the freckles',
    });
    expect(result.errorCode).toBeUndefined();
    expect(result).toMatchObject({ success: true, state: 'retouched' });
    expect(runRetouchModelMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceImageUrl: SOURCE_URL })
    );

    const storedPath = result.resultUrl?.slice(BLOB_HOST.length + 1) ?? '';
    expect(blobStore.get(storedPath)?.toString()).toBe('retouched-jpeg-bytes');

    const jobs = await jobsFor(userId);
    expect(jobs).toEqual([
      {
        id: result.jobId,
        status: 'completed',
        sourceAssetId: SOURCE_URL,
        resultAssetId: storedPath,
        perImageOverride: 'warmer skin, keep the freckles',
      },
    ]);
  });

  it("the daily limit stops the next retouch, and a failed try doesn't use it up", async () => {
    const userId = await createArtist();
    const retouch = retouchTool(userId, { dailyLimit: 1 });

    runRetouchModelMock.mockRejectedValueOnce(new Error('gateway 500'));
    const failed = await retouch({});
    expect(failed).toMatchObject({
      success: false,
      errorCode: 'RETOUCH_FAILED',
    });

    runRetouchModelMock.mockResolvedValueOnce(retouchedImage());
    const done = await retouch({});
    expect(done.success).toBe(true);

    const blocked = await retouch({});
    expect(blocked).toMatchObject({
      success: false,
      errorCode: 'DAILY_LIMIT_REACHED',
    });
    expect(runRetouchModelMock).toHaveBeenCalledTimes(2);

    const statuses = (await jobsFor(userId)).map(job => job.status).sort();
    expect(statuses).toEqual(['completed', 'failed']);
  });

  it('asking with no photo attached makes nothing', async () => {
    const userId = await createArtist();

    const result = await retouchTool(userId, { sourceImageUrl: null })({});
    expect(result).toMatchObject({
      success: false,
      errorCode: 'NO_IMAGE_ATTACHED',
    });
    expect(runRetouchModelMock).not.toHaveBeenCalled();
    expect(await jobsFor(userId)).toEqual([]);
    expect(blobStore.size).toBe(0);
  });
});
