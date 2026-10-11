import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as mock from '@/.storybook/release-task-actions-mock';
import {
  instantiateReleaseTasks,
  instantiateReleaseTasksFromCatalog,
} from '@/.storybook/release-task-actions-mock';

// .storybook/main.ts aliases both real modules onto this one mock.
const ALIASED_MODULES = [
  'app/app/(shell)/dashboard/releases/task-actions.ts',
  'app/app/(shell)/dashboard/releases/catalog-task-actions.ts',
];

function exportedNames(relativePath: string): string[] {
  const source = readFileSync(
    path.resolve(__dirname, '../../..', relativePath),
    'utf8'
  );
  return [
    ...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
  ].map(match => match[1]);
}

describe('release-task-actions-mock', () => {
  it.each(ALIASED_MODULES)('exports every name %s exports', modulePath => {
    const names = exportedNames(modulePath);
    expect(names.length).toBeGreaterThan(0);
    const missing = names.filter(name => !(name in mock));
    expect(missing).toEqual([]);
  });

  it('instantiateReleaseTasksFromCatalog resolves to an empty list', async () => {
    await expect(
      instantiateReleaseTasksFromCatalog('release-1', {})
    ).resolves.toEqual([]);
  });

  it('instantiateReleaseTasks resolves to an empty list', async () => {
    await expect(instantiateReleaseTasks('release-1')).resolves.toEqual([]);
  });

  it('reads resolve empty and adding a task fails loudly', async () => {
    await expect(mock.getReleaseTasks('release-1')).resolves.toEqual([]);
    await expect(mock.listReleaseSkillClusters()).resolves.toEqual([]);
    await expect(mock.getReleaseTaskSummary()).resolves.toEqual(new Map());
    await expect(mock.addReleaseTask('release-1', {})).rejects.toThrow(
      'not available'
    );
  });
});
