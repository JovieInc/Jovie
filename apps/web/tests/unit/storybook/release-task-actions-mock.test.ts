import { describe, expect, it } from 'vitest';
import {
  instantiateReleaseTasks,
  instantiateReleaseTasksFromCatalog,
} from '@/.storybook/release-task-actions-mock';

describe('release-task-actions-mock', () => {
  it('instantiateReleaseTasksFromCatalog resolves to an empty list', async () => {
    await expect(
      instantiateReleaseTasksFromCatalog('release-1', {})
    ).resolves.toEqual([]);
  });

  it('instantiateReleaseTasks resolves to an empty list', async () => {
    await expect(instantiateReleaseTasks('release-1')).resolves.toEqual([]);
  });
});
