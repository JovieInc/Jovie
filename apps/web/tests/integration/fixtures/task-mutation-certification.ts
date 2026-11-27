import type { Client } from '@neondatabase/serverless';
import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getTask,
  updateTask,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { createManageTasksTool } from '@/lib/chat/tools/tasks';
import type { DbType, TransactionType } from '@/lib/db';
import { getInternalDb, setInternalDb } from '@/lib/db/client/connection';
import { createSchemaDb } from '@/lib/db/client/schema-db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import {
  bulkUpdateTasksInTransaction,
  createTaskInTransaction,
  deleteTaskInTransaction,
  moveTaskInTransaction,
  updateTaskInTransaction,
} from '@/lib/tasks/mutations.server';
import { connectNeonCertificationClient } from './neon-certification-client';

// Only request identity and plan access are fixtures; adapters, validation,
// mutations, database writes and transactional readback remain production code.
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({
    userId: '00000000-0000-4000-8000-000000000001',
  }),
}));
vi.mock('@/app/app/(shell)/dashboard/requireProfileId', () => ({
  requireProfileId: async () => '00000000-0000-4000-8000-000000000002',
}));
vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireTasksWorkspaceAccess: async () => undefined,
  requireReleasePlanGenerationAccess: async () => undefined,
}));

const NOW = '2026-11-26T18:00:00.000Z';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const PROFILE = '00000000-0000-4000-8000-000000000002';
const MOVING = '00000000-0000-4000-8000-000000000003';
const SIBLING = '00000000-0000-4000-8000-000000000004';
const DONE = '00000000-0000-4000-8000-000000000005';
const FOREIGN = '00000000-0000-4000-8000-000000000006';
const OTHER_PROFILE = '00000000-0000-4000-8000-000000000007';
const OUTSIDER = '00000000-0000-4000-8000-000000000008';
const RELEASE = '00000000-0000-4000-8000-000000000009';
const CREATED = '00000000-0000-4000-8000-000000000020';
const tables = [
  users,
  creatorProfiles,
  userProfileClaims,
  discogReleases,
  tasks,
];
type Target = {
  readonly url: string;
  readonly mode: 'loopback' | 'certification';
};

/** Real SQL and rollback proof, registered under the existing isolated DB gate. */
export function registerTaskMutationCertification(
  getTarget: () => Target | null
) {
  describe('task mutations on real Postgres', () => {
    let client: Client;
    let certificationDb: DbType;
    let closeClient: (() => Promise<void>) | undefined;
    let previousDb: DbType | undefined;
    let installed = false;

    beforeAll(async () => {
      const target = getTarget();
      if (!target) throw new Error('Isolated certification database required');
      const url = new URL(target.url);
      if (
        target.mode === 'loopback' &&
        (url.hostname !== '127.0.0.1' || url.pathname !== '/jov6269_atomic')
      ) {
        throw new Error('Disposable loopback database required');
      }
      previousDb = getInternalDb();
      const connection = await connectNeonCertificationClient(target);
      client = connection.client;
      closeClient = connection.close;
      certificationDb = createSchemaDb(client);
      await client.query('CREATE TEMP TABLE task_cert_bootstrap (id integer)');
      await client.query(
        "CREATE TYPE pg_temp.release_task_status AS ENUM ('backlog','todo','in_progress','done','cancelled')"
      );
      for (const table of tables) {
        const config = getTableConfig(table);
        const columns = config.columns.map(column => {
          const type =
            table === tasks && column.name === 'status'
              ? 'pg_temp.release_task_status'
              : column.getSQLType() === 'uuid'
                ? 'uuid'
                : ({
                    boolean: 'boolean',
                    number: 'integer',
                    date: 'timestamp',
                    json: 'jsonb',
                    array: 'text[]',
                  }[column.dataType] ?? 'text');
          let defaults = '';
          if (column.name === 'id')
            defaults = ' PRIMARY KEY DEFAULT gen_random_uuid()';
          else if (table === tasks && column.name === 'status')
            defaults = " DEFAULT 'todo'";
          else if (column.name === 'mutation_version') defaults = ' DEFAULT 1';
          else if (column.name === 'created_at' || column.name === 'updated_at')
            defaults = ` DEFAULT '${NOW}'::timestamp`;
          return `"${column.name}" ${type}${defaults}`;
        });
        await client.query(
          `CREATE TEMP TABLE "${config.name}" (${columns.join(',')})`
        );
      }
      await client.query(
        'CREATE UNIQUE INDEX task_cert_number ON tasks(creator_profile_id,task_number)'
      );
      await client.query(`CREATE FUNCTION pg_temp.task_cert_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE n integer := coalesce(nullif(current_setting('jovie.task_write_count',true),''),'0')::integer + 1;
        BEGIN PERFORM set_config('jovie.task_write_count',n::text,true);
          IF n = coalesce(nullif(current_setting('jovie.task_fail_after',true),''),'0')::integer THEN RAISE EXCEPTION 'injected task write %',n; END IF;
          RETURN NEW;
        END $$`);
      for (const table of [creatorProfiles, tasks]) {
        await client.query(
          `CREATE TRIGGER task_cert_failure AFTER INSERT OR UPDATE ON "${getTableConfig(table).name}" FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.task_cert_failure()`
        );
      }
      // Simulate a guarded UPDATE matching only part of the intended row set.
      // A real trigger skips one row; the production helper must reject and the
      // real transaction must undo the other rows already changed by that SQL.
      await client.query(`CREATE FUNCTION pg_temp.task_cert_skip() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id::text = current_setting('jovie.task_skip_id',true) THEN RETURN NULL; END IF; RETURN NEW; END $$`);
      await client.query(
        'CREATE TRIGGER task_cert_skip BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION pg_temp.task_cert_skip()'
      );
      setInternalDb(certificationDb);
      installed = true;
    });
    afterAll(async () => {
      if (installed) setInternalDb(previousDb);
      await closeClient?.();
    });
    const queryRows = async (statement: SQL) =>
      (await certificationDb.execute<Record<string, unknown>>(statement)).rows;
    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(NOW));
      for (const table of tables)
        await client.query(`TRUNCATE "${getTableConfig(table).name}"`);
      await queryRows(
        drizzleSql`INSERT INTO users(id,email,user_status) VALUES (${ACTOR},'tasks@example.com','active'),(${OUTSIDER},'outsider@example.com','active')`
      );
      await queryRows(
        drizzleSql`INSERT INTO creator_profiles(id,next_task_number) VALUES (${PROFILE},10),(${OTHER_PROFILE},10)`
      );
      await queryRows(
        drizzleSql`INSERT INTO user_profile_claims(user_id,creator_profile_id,role) VALUES (${ACTOR},${PROFILE},'owner'),(${OUTSIDER},${OTHER_PROFILE},'owner')`
      );
      await queryRows(drizzleSql`INSERT INTO tasks(id,creator_profile_id,task_number,title,status,priority,assignee_kind,agent_status,position,mutation_version,metadata,completed_at) VALUES
        (${MOVING},${PROFILE},1,'Record announcement','todo','medium','human','idle',1024,1,'{"keep":"moving"}',null),
        (${SIBLING},${PROFILE},2,'Review artwork','todo','low','human','idle',2048,4,'{"keep":"sibling"}',null),
        (${DONE},${PROFILE},3,'Prepare release','done','medium','jovie','idle',1024,9,'{}',${NOW}),
        (${FOREIGN},${OTHER_PROFILE},1,'Private task','todo','medium','human','idle',1024,1,'{}',null)`);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const snapshot = async () =>
      Promise.all(
        tables.map(
          async table =>
            (
              await client.query<Record<string, unknown>>(
                `SELECT * FROM "${getTableConfig(table).name}" ORDER BY id`
              )
            ).rows
        )
      );
    const rows = () =>
      queryRows(
        drizzleSql`SELECT id,status,position,mutation_version,completed_at,deleted_at,title,priority,metadata,assignee_user_id FROM tasks ORDER BY id`
      );
    const operate = <T>(
      operation: (tx: TransactionType) => Promise<T>,
      options: { failAfter?: number; skipId?: string } = {}
    ) =>
      runAtomicDbOperation(
        async tx => {
          await tx.execute(
            drizzleSql`SELECT set_config('jovie.task_write_count','0',true), set_config('jovie.task_fail_after',${String(options.failAfter ?? 0)},true), set_config('jovie.task_skip_id',${options.skipId ?? ''},true)`
          );
          return operation(tx);
        },
        { actorId: ACTOR, retry: 'never' }
      );
    const move = (tx: TransactionType) =>
      moveTaskInTransaction(tx, PROFILE, {
        taskId: MOVING,
        toStatus: 'done',
        beforeTaskId: DONE,
        expectedMutationVersion: 1,
      });

    it('shares task identity and revisions between chat actions and the UI mutation path', async () => {
      const tool = createManageTasksTool(PROFILE);
      const invoke = tool.execute;
      if (!invoke) throw new Error('Task tool has no executor');
      const execute = async (input: Parameters<typeof invoke>[0]) => {
        const result = await invoke(input, {
          toolCallId: 'task-mutation-certification',
          messages: [],
          context: {},
        });
        if (Symbol.asyncIterator in result) {
          throw new Error('Task tool unexpectedly returned a result stream');
        }
        return result;
      };
      const captured = await execute({
        intent: 'create',
        title: 'Record the release announcement',
      });
      expect(captured.success).toBe(true);
      if (!captured.success || !('task' in captured) || !captured.task)
        throw new Error('Chat did not return the created task');
      const taskId = captured.task.id;
      expect(captured.task.mutationVersion).toBe(1);
      await updateTask(taskId, {
        priority: 'high',
        expectedMutationVersion: 1,
      });
      expect(await execute({ intent: 'get', taskId })).toMatchObject({
        success: true,
        task: { id: taskId, priority: 'high', mutationVersion: 2 },
      });
      expect(
        await execute({
          intent: 'move',
          taskId,
          status: 'in_progress',
          expectedMutationVersion: 2,
        })
      ).toMatchObject({ success: true });
      expect(await getTask(taskId)).toMatchObject({
        status: 'in_progress',
        mutationVersion: 3,
      });
      expect(
        await execute({
          intent: 'update',
          taskId,
          assigneeKind: 'jovie',
          expectedMutationVersion: 3,
        })
      ).toMatchObject({
        success: true,
        task: { id: taskId, assigneeKind: 'jovie', mutationVersion: 4 },
      });
      const committed = await snapshot();
      expect(
        await execute({
          intent: 'move',
          taskId,
          status: 'done',
          expectedMutationVersion: 2,
        })
      ).toMatchObject({ success: false, errorCode: 'CONFLICT' });
      expect(await snapshot()).toEqual(committed);
    });

    it('rolls back all rows when a coupled move only updates a subset', async () => {
      const before = await snapshot();
      await expect(operate(move, { skipId: SIBLING })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await snapshot()).toEqual(before);
    });

    it('commits a coherent move with every changed revision and rejects stale follow-up work', async () => {
      const result = await operate(move);
      expect(result.affectedTasks).toHaveLength(3);
      expect(
        result.affectedTasks.find(task => task.id === MOVING)
      ).toMatchObject({
        status: 'done',
        position: 1024,
        mutationVersion: 2,
        completedAt: new Date(NOW),
      });
      expect(
        result.affectedTasks.find(task => task.id === SIBLING)
      ).toMatchObject({ status: 'todo', position: 1024, mutationVersion: 5 });
      expect(result.affectedTasks.find(task => task.id === DONE)).toMatchObject(
        { status: 'done', position: 2048, mutationVersion: 10 }
      );
      const committed = await snapshot();
      await expect(operate(move)).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        operate(tx =>
          updateTaskInTransaction(tx, PROFILE, MOVING, {
            title: 'Stale title',
            expectedMutationVersion: 1,
          })
        )
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await snapshot()).toEqual(committed);
      expect(
        (await rows()).find(task => task.id === SIBLING)?.metadata
      ).toEqual({ keep: 'sibling' });
    });

    it('returns the authoritative moving revision for a no-op without revision churn', async () => {
      const before = await snapshot();
      const result = await operate(tx =>
        moveTaskInTransaction(tx, PROFILE, {
          taskId: MOVING,
          toStatus: 'todo',
          beforeTaskId: SIBLING,
          expectedMutationVersion: 1,
        })
      );
      expect(result.affectedTasks).toEqual([await getTask(MOVING)]);
      expect(await snapshot()).toEqual(before);
    });

    it('returns complete current sibling content with every revision advanced by reordering', async () => {
      await queryRows(
        drizzleSql`INSERT INTO discog_releases(id,creator_profile_id,title) VALUES (${RELEASE},${PROFILE},'New single')`
      );
      await operate(tx =>
        updateTaskInTransaction(tx, PROFILE, SIBLING, {
          expectedMutationVersion: 4,
          title: 'Artwork revised by another editor',
          description: 'Use the approved cover',
          priority: 'high',
          assigneeKind: 'jovie',
          releaseId: RELEASE,
          metadata: { keep: 'remote content' },
        })
      );
      const result = await operate(move);
      const sibling = result.affectedTasks.find(task => task.id === SIBLING);
      expect(sibling).toEqual(await getTask(SIBLING));
      expect(sibling).toMatchObject({
        title: 'Artwork revised by another editor',
        description: 'Use the approved cover',
        priority: 'high',
        assigneeKind: 'jovie',
        releaseId: RELEASE,
        releaseTitle: 'New single',
        metadata: { keep: 'remote content' },
        position: 1024,
        mutationVersion: 6,
      });
    });

    it('rolls back every earlier bulk write when a later write fails', async () => {
      const before = await snapshot();
      const bulk = (tx: TransactionType) =>
        bulkUpdateTasksInTransaction(
          tx,
          PROFILE,
          [MOVING, SIBLING],
          { priority: 'high' },
          { [MOVING]: 1, [SIBLING]: 4 }
        );
      await expect(operate(bulk, { failAfter: 2 })).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      const updated = await operate(bulk);
      expect(
        updated.map(task => [task.id, task.priority, task.mutationVersion])
      ).toEqual([
        [MOVING, 'high', 2],
        [SIBLING, 'high', 5],
      ]);
    });

    it('rolls back task-number reservation when creation fails and then creates one task', async () => {
      const before = await snapshot();
      const create = (tx: TransactionType) =>
        createTaskInTransaction(
          tx,
          PROFILE,
          {
            title: 'Record the hook',
            parentTaskId: SIBLING,
            assigneeUserId: ACTOR,
          },
          CREATED
        );
      await expect(operate(create, { failAfter: 2 })).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      const created = await operate(create);
      expect(created).toMatchObject({
        id: CREATED,
        taskNumber: 10,
        status: 'todo',
        mutationVersion: 1,
        parentTaskId: SIBLING,
        assigneeUserId: ACTOR,
      });
      expect((await rows()).filter(task => task.id === CREATED)).toHaveLength(
        1
      );
      expect(
        await queryRows(
          drizzleSql`SELECT next_task_number FROM creator_profiles WHERE id=${PROFILE}`
        )
      ).toEqual([expect.objectContaining({ next_task_number: 11 })]);
    });

    it('guards legacy unversioned updates, explicit deletes and profile scope', async () => {
      const before = await snapshot();
      await expect(
        operate(
          tx =>
            updateTaskInTransaction(tx, PROFILE, MOVING, {
              title: 'New title',
            }),
          { skipId: MOVING }
        )
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        operate(tx => deleteTaskInTransaction(tx, PROFILE, SIBLING, 3))
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        operate(tx => deleteTaskInTransaction(tx, PROFILE, FOREIGN))
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await snapshot()).toEqual(before);
      await operate(tx => deleteTaskInTransaction(tx, PROFILE, SIBLING, 4));
      expect((await rows()).find(task => task.id === SIBLING)).toMatchObject({
        mutation_version: 5,
        deleted_at: '2026-11-26 18:00:00',
      });
    });

    it('rejects foreign parents, cycles and unrelated assignees without modifying commitments', async () => {
      const before = await snapshot();
      await expect(
        operate(tx =>
          updateTaskInTransaction(tx, PROFILE, MOVING, {
            parentTaskId: FOREIGN,
          })
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        operate(tx =>
          updateTaskInTransaction(tx, PROFILE, MOVING, { parentTaskId: MOVING })
        )
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(
        operate(tx =>
          updateTaskInTransaction(tx, PROFILE, MOVING, {
            assigneeUserId: OUTSIDER,
          })
        )
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(await snapshot()).toEqual(before);
      await queryRows(
        drizzleSql`UPDATE tasks SET parent_task_id=${MOVING} WHERE id=${SIBLING}`
      );
      const withChild = await snapshot();
      await expect(
        operate(tx =>
          updateTaskInTransaction(tx, PROFILE, MOVING, {
            parentTaskId: SIBLING,
          })
        )
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(await snapshot()).toEqual(withChild);
    });
  });
}
