// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const database = vi.hoisted(() => ({ open: null as PGlite | null }));
vi.mock('@/lib/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  database.open = new PGlite({ initialMemory: 128 * 1024 * 1024 });
  return { db: drizzle(database.open) };
});

import { loadLibraryDocuments } from './library-page';

const owner = '10000000-0000-4000-8000-000000000001';
const foreign = '10000000-0000-4000-8000-000000000002';
const target = '20000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  await database.open!.exec(`
    create table creator_documents (id uuid primary key, creator_profile_id uuid, title text, kind text, stage text, current_revision int, created_at timestamptz, updated_at timestamptz);
    create table creator_document_revisions (document_id uuid, revision int, content jsonb, plain_text text);
  `);
  await database.open!.query(
    "insert into creator_documents values ($1,$2,'Target','idea','private_draft',2,'2025-01-01',now())",
    [target, owner]
  );
  await database.open!.query(
    "insert into creator_documents select gen_random_uuid(),$1,'Other','idea','private_draft',1,now(),now() from generate_series(1,51)",
    [owner]
  );
  await database.open!.exec(
    "insert into creator_document_revisions select id,current_revision,'{}'::jsonb,title from creator_documents"
  );
});
afterAll(async () => {
  await database.open?.close();
});

it('reopens the exact revision beyond 50 documents while preserving the list cursor and profile boundary', async () => {
  const first = await loadLibraryDocuments(owner, null);
  expect(first.documents).toHaveLength(50);
  expect(first.documents.map(item => item.id)).not.toContain(target);
  const reopened = await loadLibraryDocuments(owner, target);
  expect(reopened.nextCursor).toBe(first.nextCursor);
  expect(reopened.documents.at(-1)).toMatchObject({
    id: target,
    currentRevision: 2,
    plainText: 'Target',
    stage: 'private_draft',
  });
  expect((await loadLibraryDocuments(foreign, target)).documents).toEqual([]);
  const missing = await loadLibraryDocuments(
    owner,
    '30000000-0000-4000-8000-000000000001'
  );
  expect(missing.documents).toHaveLength(50);
});
