import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AGENT_BRANCH_RE,
  classifyOpenPr,
  inventoryOpenPrs,
  parseArgs,
  SCHEMA,
} from './pr-no-stall.mjs';

const NOW = Date.parse('2026-11-20T20:00:00Z');

describe('pr-no-stall classifier', () => {
  it('exports a stable receipt schema', () => {
    assert.equal(SCHEMA, 'jovie-summer-pr-no-stall/v1');
  });

  it('recognizes cursor/ and sibling agent prefixes the old harness missed', () => {
    assert.equal(
      AGENT_BRANCH_RE.test('cursor/summer-no-stall-watchdog-9c4a'),
      true
    );
    assert.equal(
      AGENT_BRANCH_RE.test('glm/golden-path-copy-waitlist-claim'),
      true
    );
    assert.equal(
      AGENT_BRANCH_RE.test('ha/jov-13131-flag-inventory-shipon'),
      true
    );
    assert.equal(AGENT_BRANCH_RE.test('evr/jov-13110-shared-web-build'), true);
    assert.equal(AGENT_BRANCH_RE.test('screenshots/auto-update'), false);
  });

  it('flags admission-deadlock: ready + lane-fix-red + idle + mergeable', () => {
    const row = classifyOpenPr(
      {
        number: 25075,
        title: 'retire seer',
        isDraft: false,
        mergeable: 'MERGEABLE',
        mergeStateStatus: 'BLOCKED',
        headRefName: 'chore/retire-seer-controller-review',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: [{ name: 'lane-fix-red' }],
      },
      { nowMs: NOW, idleHours: 6 }
    );
    assert.equal(row.class, 'admission-deadlock');
    assert.equal(row.action, 'empty-head-bump');
  });

  it('does not reclaim stop-labeled PRs (Tim)', () => {
    const row = classifyOpenPr(
      {
        number: 1,
        isDraft: false,
        mergeable: 'MERGEABLE',
        headRefName: 'cursor/x',
        updatedAt: '2026-11-11T20:00:00Z',
        labels: ['lane-fix-red', 'hold'],
      },
      { nowMs: NOW }
    );
    assert.equal(row.class, 'tim-or-hold');
    assert.equal(row.action, 'leave-for-tim');
  });

  it('flags draft-green stale for auto-ready', () => {
    const row = classifyOpenPr(
      {
        number: 25698,
        isDraft: true,
        mergeable: 'MERGEABLE',
        headRefName: 'chloe/jov-12405-connector-docs',
        updatedAt: '2026-11-19T03:00:00Z',
        labels: ['lane-fix-green', 'lane-fix-stale'],
      },
      { nowMs: NOW }
    );
    assert.equal(row.class, 'draft-green-stale');
    assert.equal(row.action, 'auto-ready');
  });

  it('leaves fresh in-flight heads alone', () => {
    const row = classifyOpenPr(
      {
        number: 26145,
        isDraft: false,
        mergeable: 'MERGEABLE',
        headRefName: 'cursor/measure-first-chat-send-195f',
        updatedAt: '2026-11-20T19:50:00Z',
        labels: [],
      },
      { nowMs: NOW, idleHours: 6 }
    );
    assert.equal(row.class, 'ok-or-active');
    assert.equal(row.action, 'none');
  });

  it('inventories counts by class', () => {
    const report = inventoryOpenPrs(
      [
        {
          number: 1,
          isDraft: false,
          mergeable: 'MERGEABLE',
          headRefName: 'cursor/a',
          updatedAt: '2026-11-11T20:00:00Z',
          labels: ['lane-fix-red'],
        },
        {
          number: 2,
          isDraft: true,
          mergeable: 'MERGEABLE',
          headRefName: 'codex/b',
          updatedAt: '2026-11-19T03:00:00Z',
          labels: ['lane-fix-green'],
        },
      ],
      { nowMs: NOW }
    );
    assert.equal(report.schema, SCHEMA);
    assert.equal(report.openCount, 2);
    assert.equal(report.byClass['admission-deadlock'], 1);
    assert.equal(report.byClass['draft-green-stale'], 1);
    assert.equal(report.actionable.length, 2);
  });

  it('parses CLI flags', () => {
    assert.deepEqual(
      parseArgs(['--apply', '--limit', '3', '--idle-hours=12', '--json']),
      {
        apply: true,
        limit: 3,
        idleHours: 12,
        json: true,
        help: false,
      }
    );
  });
});
