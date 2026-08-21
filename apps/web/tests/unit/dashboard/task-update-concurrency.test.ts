import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('task editor optimistic concurrency', () => {
  it('requires the editor snapshot timestamp in the guarded update', async () => {
    const source = await readFile(
      join(process.cwd(), 'app/app/(shell)/dashboard/tasks/task-actions.ts'),
      'utf8'
    );
    const update = source.slice(
      source.indexOf('export async function updateTask'),
      source.indexOf('const MAX_MOVE_ATTEMPTS')
    );

    expect(update).toContain('data.expectedMutationVersion');
    expect(update).toContain(
      'eq(tasks.mutationVersion, expectedMutationVersion)'
    );
    expect(update).toContain('tasks.mutationVersion} + 1');
    expect(update).toContain('Task changed in another session');
  });
});
