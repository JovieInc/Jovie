import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import {
  buildChatOutcomeReport,
  judgeMessageRows,
} from './turn-outcome-report';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 22, 10, minute));

const rows = [
  // Tim's staging transcript: merch returned zero designs.
  {
    conversationId: 'c1',
    role: 'user',
    content: 'make merch',
    toolCalls: null,
    createdAt: at(1),
  },
  {
    conversationId: 'c1',
    role: 'assistant',
    content:
      'The concepts are waiting on review. Tell me which title and any visual direction?',
    toolCalls: [
      {
        schemaVersion: 2,
        toolCallId: 't1',
        toolName: 'createMerch',
        state: 'succeeded',
        output: { success: true, designs: [] },
        uiHint: 'artifact',
      },
    ],
    createdAt: at(2),
  },
  {
    conversationId: 'c1',
    role: 'user',
    content: 'create a task',
    toolCalls: null,
    createdAt: at(3),
  },
  {
    conversationId: 'c1',
    role: 'assistant',
    content: 'Task created.',
    toolCalls: [
      {
        schemaVersion: 2,
        toolCallId: 't2',
        toolName: 'manageTasks',
        state: 'succeeded',
        input: { intent: 'create' },
        output: { success: true, intent: 'create' },
        uiHint: 'status',
      },
    ],
    createdAt: at(4),
  },
  {
    conversationId: 'c2',
    role: 'user',
    content: 'hi',
    toolCalls: null,
    createdAt: at(5),
  },
  {
    conversationId: 'c2',
    role: 'assistant',
    content: 'Hey.',
    toolCalls: null,
    createdAt: at(6),
  },
];

describe('chat outcome report', () => {
  it('pairs turns, files merch as stalled, and checks the task intent green', () => {
    const turns = judgeMessageRows(rows);
    expect(turns).toHaveLength(3);
    const report = buildChatOutcomeReport(turns, at(30));
    expect(report.checks).toEqual(['chat-stall-merch', 'chat-stall-task']);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      key: 'chat-stall-merch',
      evidence: {
        stalled: 1,
        judged: 1,
        reasons: { 'action.empty_outcome:createMerch': 1 },
        sampleTurns: [{ conversationId: 'c1' }],
      },
    });
    expect(report.totals).toMatchObject({
      turns: 3,
      actionTurns: 2,
      stalled: 1,
    });
  });

  it('never puts message text in a finding', () => {
    const report = buildChatOutcomeReport(judgeMessageRows(rows), at(30));
    expect(JSON.stringify(report.findings)).not.toContain('waiting on review');
  });
});
