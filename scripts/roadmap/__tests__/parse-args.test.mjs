import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatHelp, parseRoadmapArgs } from '../parse-args.mjs';

describe('parseRoadmapArgs', () => {
  it('returns help for empty argv', () => {
    const r = parseRoadmapArgs([]);
    assert.equal(r.ok, true);
    assert.equal(r.command, 'help');
  });

  it('parses each known command', () => {
    for (const cmd of [
      'add',
      'expand',
      'sync',
      'today',
      'approved',
      'agent-brief',
    ]) {
      const r = parseRoadmapArgs([cmd]);
      assert.equal(r.ok, true);
      assert.equal(r.command, cmd);
    }
  });

  it('rejects unknown commands', () => {
    const r = parseRoadmapArgs(['nope']);
    assert.equal(r.ok, false);
    assert.match(r.error, /Unknown command/);
  });

  it('parses positionals and boolean/value flags', () => {
    const r = parseRoadmapArgs([
      'add',
      'Ship',
      'parser',
      '--description',
      'body',
      '--dry-run',
      '--priority',
      '2',
      '--labels=a,b',
    ]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.positionals, ['Ship', 'parser']);
    assert.equal(r.flags.description, 'body');
    assert.equal(r.flags['dry-run'], true);
    assert.equal(r.flags.priority, '2');
    assert.equal(r.flags.labels, 'a,b');
  });

  it('formatHelp mentions all subcommands', () => {
    const help = formatHelp();
    for (const cmd of [
      'add',
      'expand',
      'sync',
      'today',
      'approved',
      'agent-brief',
    ]) {
      assert.match(help, new RegExp(cmd));
    }
  });
});
