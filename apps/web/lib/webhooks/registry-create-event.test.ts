import { describe, expect, it } from 'vitest';
import {
  extractGithubCreate,
  extractVercelCreate,
} from './registry-create-event';

describe('extractGithubCreate', () => {
  it.each(['created', 'renamed', 'transferred'])(
    'extracts only the kind and full name for repository.%s',
    action => {
      expect(
        extractGithubCreate('repository', {
          action,
          repository: { full_name: 'JovieInc/new-thing', private: true },
          sender: { email: 'private@example.com' },
        })
      ).toEqual({ kind: 'github-repo', name: 'JovieInc/new-thing' });
    }
  );

  it.each([null, 'push', 'Repository', 'repository.created'])(
    'ignores event header %j',
    eventName => {
      expect(
        extractGithubCreate(eventName, {
          action: 'created',
          repository: { full_name: 'JovieInc/new-thing' },
        })
      ).toBeNull();
    }
  );

  it.each([
    null,
    [],
    'repository',
    {},
    { action: 'deleted' },
    { action: ['created'], repository: { full_name: 'JovieInc/new-thing' } },
    { action: 'created', repository: null },
  ])('ignores invalid payload %j', payload => {
    expect(extractGithubCreate('repository', payload)).toBeNull();
  });

  it.each([
    null,
    123,
    '',
    'new-thing',
    '/repo',
    'org/',
    'org/repo/extra',
    'org/repo name',
    'org/répo',
    'org/repo\n',
    `${'o'.repeat(101)}/repo`,
    `org/${'r'.repeat(101)}`,
  ])('ignores invalid full name %j', name => {
    expect(
      extractGithubCreate('repository', {
        action: 'created',
        repository: { full_name: name },
      })
    ).toBeNull();
  });

  it('accepts the allowed characters and both 100-character boundaries', () => {
    const name = `${'a'.repeat(96)}_-.Z/${'b'.repeat(96)}_-.9`;
    expect(
      extractGithubCreate('repository', {
        action: 'created',
        repository: { full_name: name },
      })
    ).toEqual({ kind: 'github-repo', name });
  });
});

describe('extractVercelCreate', () => {
  it.each(['project.created', 'project.renamed'])(
    'extracts only the kind and name for %s',
    type => {
      expect(
        extractVercelCreate({
          type,
          payload: {
            project: { name: 'New.thing_1-2', id: 'private-project-id' },
            user: { email: 'private@example.com' },
          },
        })
      ).toEqual({ kind: 'vercel-project', name: 'New.thing_1-2' });
    }
  );

  it.each([
    null,
    [],
    {},
    { type: 'deployment.created' },
    { type: 'project-created' },
    { type: 'project.created', payload: null },
    { type: 'project.created', payload: { project: [] } },
  ])('ignores other or malformed payload %j', payload => {
    expect(extractVercelCreate(payload)).toBeNull();
  });

  it.each([null, 123, '', 'a/b', 'a b', 'é', 'repo\n', 'a'.repeat(101)])(
    'ignores invalid project name %j',
    name => {
      expect(
        extractVercelCreate({
          type: 'project.created',
          payload: { project: { name } },
        })
      ).toBeNull();
    }
  );

  it('accepts a 100-character name', () => {
    const name = 'a'.repeat(100);
    expect(
      extractVercelCreate({
        type: 'project.created',
        payload: { project: { name } },
      })
    ).toEqual({ kind: 'vercel-project', name });
  });
});
