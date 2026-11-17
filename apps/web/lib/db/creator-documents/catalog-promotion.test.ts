// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ideaContent } from '@/lib/creator-documents/domain';

vi.mock('server-only', () => ({}));

const database = vi.hoisted(() => ({ open: null as PGlite | null }));
vi.mock('@/lib/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  database.open = new PGlite({ initialMemory: 128 * 1024 * 1024 });
  return { db: drizzle(database.open) };
});

import { selectedPromotionWork } from './catalog-promotion';
import {
  captureCreatorIdea,
  listCreatorDocuments,
  saveCreatorDocumentRevision,
} from './store';

const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const work = '20000000-0000-4000-8000-000000000001';
const namesake = '20000000-0000-4000-8000-000000000002';
const alternateRecording = '20000000-0000-4000-8000-000000000003';

describe('private promotion capture with an isolated PostgreSQL catalog', () => {
  beforeAll(async () => {
    await database.open!.exec(`
      create table discog_releases (id uuid primary key, creator_profile_id uuid, title text, slug text, deleted_at timestamp, status text, release_date timestamp);
      create table creator_documents (id uuid primary key default gen_random_uuid(), creator_profile_id uuid, title text, kind text,
        stage text default 'private_draft', current_revision int default 1, capture_idempotency_key text,
        created_at timestamptz default now(), updated_at timestamptz default now());
      create unique index capture_key on creator_documents(creator_profile_id,capture_idempotency_key) where capture_idempotency_key is not null;
      create table creator_document_revisions (document_id uuid, revision int, title text, kind text, content jsonb, plain_text text,
        schema_version int, content_hash text, created_by_user_id text, primary key(document_id,revision));
      create table library_relationships (creator_profile_id uuid, kind text, subject_type text, subject_id text, object_type text,
        object_id text, status text, evidence jsonb);
    `);
    await database.open!.query(
      "insert into discog_releases (id, creator_profile_id,title,slug,deleted_at,status) values ($1,$2,'Same title','one',null,'released'),($3,$4,'Same title','two',null,'released'),($5,$2,'Same title','alternate',null,'released')",
      [work, owner, namesake, other, alternateRecording]
    );
  });
  afterAll(async () => {
    await database.open?.close();
  });

  it('captures only the selected release, deduplicates, then reloads the edited private revision', async () => {
    const capture = {
      creatorProfileId: owner,
      userId: 'fixture',
      title: 'Private caption',
      body: 'A first pass',
      idempotencyKey: 'retry-key',
      catalogSelection: { profileId: owner, releaseId: work },
    };
    expect(await selectedPromotionWork(owner, namesake)).toEqual([]);
    await expect(
      captureCreatorIdea({
        ...capture,
        catalogSelection: { profileId: owner, releaseId: namesake },
      })
    ).rejects.toThrow();
    await expect(
      captureCreatorIdea({ ...capture, creatorProfileId: other })
    ).rejects.toThrow();
    expect(
      await selectedPromotionWork(owner, alternateRecording)
    ).toMatchObject([{ id: alternateRecording, slug: 'alternate' }]);
    const saved = await captureCreatorIdea(capture);
    expect((await captureCreatorIdea(capture)).documentId).toBe(
      saved.documentId
    );
    await saveCreatorDocumentRevision({
      creatorProfileId: owner,
      userId: 'fixture',
      documentId: saved.documentId,
      expectedRevision: 1,
      title: capture.title,
      kind: 'idea',
      content: ideaContent('Revised caption'),
      plainText: 'Revised caption',
    });
    const page = await listCreatorDocuments(owner);
    expect(page.documents).toHaveLength(1);
    expect(page.documents[0]).toMatchObject({
      id: saved.documentId,
      currentRevision: 2,
      plainText: 'Revised caption',
      stage: 'private_draft',
    });
    expect((await listCreatorDocuments(other)).documents).toEqual([]);
    const relationships = await database.open!.query(
      'select subject_id, object_id from library_relationships'
    );
    expect(relationships.rows).toEqual([
      { subject_id: saved.documentId, object_id: work },
    ]);
  });
});
