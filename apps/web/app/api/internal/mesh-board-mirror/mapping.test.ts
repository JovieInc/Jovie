import { describe, expect, it } from 'vitest';
import {
  auditLine,
  type HubRow,
  idemKey,
  MESH_CHANNEL,
  MirrorWriter,
  replyKey,
  rowLabels,
  rowText,
} from './mapping';

const row = (over: Partial<HubRow> = {}): HubRow => ({
  stageId: 7,
  taskId: 'fc-1',
  type: 'task',
  title: 'Fact-check deck',
  poster: 'summer',
  assignee: null,
  caps: ['research', 'browser'],
  parent: null,
  status: 'open',
  actor: 'summer',
  stage: 'posted',
  at: 1_700_000_000_000,
  ...over,
});

type Call = { kind: string; args: unknown[] };

/** A BoardHandle recorder: every method logs its call and answers canned views. */
function fakeTeam(over: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  const team = {
    post: async (...args: unknown[]) => {
      calls.push({ kind: 'post', args });
      return { id: 'msg_post_1', mentions: [] };
    },
    reply: async (...args: unknown[]) => {
      calls.push({ kind: 'reply', args });
      return { id: 'msg_reply_1', mentions: [] };
    },
    label: async (...args: unknown[]) => {
      calls.push({ kind: 'label', args });
      return { ok: true };
    },
    messages: async (...args: unknown[]) => {
      calls.push({ kind: 'messages', args });
      return {
        messages: (over.messages ?? []) as Array<{
          id: string;
          re: string | null;
          labels?: Record<string, string>;
        }>,
        cursor: '',
      };
    },
    tasks: {
      list: async (...args: unknown[]) => {
        calls.push({ kind: 'tasks.list', args });
        return {
          tasks: (over.tasks ?? []) as Array<{ message: { id: string } }>,
          cursor: '',
        };
      },
      create: async (...args: unknown[]) => {
        calls.push({ kind: 'tasks.create', args });
        return { task: { id: 'msg_task_1' }, mentions: [] };
      },
      claim: async (...args: unknown[]) => {
        calls.push({ kind: 'tasks.claim', args });
        return {
          task: { id: 'msg_task_1' },
          epoch: 1,
          token: 't',
          until: new Date().toISOString(),
          renew: async () => ({}) as never,
          release: async () => ({}) as never,
          complete: async (...completeArgs: unknown[]) => {
            calls.push({ kind: 'complete', args: completeArgs });
            return { id: 'msg_task_1' } as never;
          },
          fail: async (...failArgs: unknown[]) => {
            calls.push({ kind: 'fail', args: failArgs });
            return { id: 'msg_task_1' } as never;
          },
          block: async () => ({}) as never,
        };
      },
      cancel: async (...args: unknown[]) => {
        calls.push({ kind: 'tasks.cancel', args });
        return { id: 'msg_task_1' } as never;
      },
    },
  };
  return { team, calls };
}

describe('mirror mapping', () => {
  it('keys every write off the hub stage id for idempotency', () => {
    expect(idemKey(41)).toBe('hub-stage-41');
    expect(replyKey(41)).toBe('hub-stage-41-reply');
  });

  it('labels carry the hub join fields, actor/pool and caps', () => {
    const labels = rowLabels(row(), { hub_state: 'open' });
    expect(labels.hub_id).toBe('fc-1');
    expect(labels.hub_type).toBe('task');
    expect(labels.hub_stage).toBe('7');
    expect(labels.hub_at).toBe('1700000000000');
    expect(labels.hub_state).toBe('open');
    expect(labels.hub_pool).toBe('1');
    expect(labels.hub_assignee).toBeUndefined();
    expect(labels.cap_research).toBe('1');
    expect(labels.cap_browser).toBe('1');
    expect(Object.keys(labels).some(key => key.startsWith('board.'))).toBe(
      false
    );
    const assigned = rowLabels(row({ assignee: 'codex', parent: 'deck' }), {});
    expect(assigned.hub_assignee).toBe('codex');
    expect(assigned.hub_pool).toBeUndefined();
    expect(assigned.hub_parent).toBe('deck');
  });

  it('task text is the title by default and title+body in body mode', () => {
    expect(rowText(row(), false)).toBe('Fact-check deck');
    expect(
      rowText(row({ body: 'b'.repeat(3_000) }), true).length
    ).toBeLessThanOrEqual('Fact-check deck\n\n'.length + 2_000);
  });

  it('the audit line logs shape only and never board writes', () => {
    const line = auditLine({
      type: 'message.posted',
      cursor: 'cur-9',
      createdAt: '2026-11-19T16:00:00.000Z',
      message: {
        id: 'msg_1',
        labels: { hub_stage: '41', hub_at: '1700000000000' },
      },
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.evt).toBe('board_pilot');
    expect(parsed.type).toBe('message.posted');
    expect(parsed.cursor).toBe('cur-9');
    expect(parsed.msgId).toBe('msg_1');
    expect(parsed.hubStage).toBe('41');
    expect(parsed.hubAt).toBe(1_700_000_000_000);
    expect(parsed.eventAt).toBe('2026-11-19T16:00:00.000Z');
    expect(typeof parsed.wakeAt).toBe('number');
  });
});

describe('MirrorWriter per stage', () => {
  it('posted task/merge: tasks.create on mesh/tasks as mesh-hub with labels + id', async () => {
    const { team, calls } = fakeTeam();
    const writer = new MirrorWriter(team as never);
    const out = await writer.apply(row());
    expect(out.action).toBe('posted-task');
    const call = calls.find(c => c.kind === 'tasks.create');
    expect(call).toBeTruthy();
    const [channel, input] = call!.args as [string, Record<string, unknown>];
    expect(channel).toBe(MESH_CHANNEL);
    expect(input.id).toBe('hub-stage-7');
    expect(input.text).toBe('Fact-check deck');
    expect((input.labels as Record<string, string>).hub_state).toBe('open');
    expect((input.labels as Record<string, string>).hub_id).toBe('fc-1');
  });

  it('posted question: a plain post labeled hub_type=question, not a task', async () => {
    const { team, calls } = fakeTeam();
    const writer = new MirrorWriter(team as never);
    const out = await writer.apply(row({ type: 'question', stage: 'posted' }));
    expect(out.action).toBe('posted-question');
    expect(calls.some(c => c.kind === 'post')).toBe(true);
    expect(calls.some(c => c.kind === 'tasks.create')).toBe(false);
  });

  it('claimed: labels + a reply, never a real Board claim (lease ceilings differ)', async () => {
    const { team, calls } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer = new MirrorWriter(team as never);
    await writer.apply(
      row({ stage: 'claimed', actor: 'codex', status: 'claimed' })
    );
    expect(calls.some(c => c.kind === 'tasks.claim')).toBe(false);
    const label = calls.find(c => c.kind === 'label');
    expect(label).toBeTruthy();
    const [id, change] = label!.args as [
      string,
      { set: Record<string, string> },
    ];
    expect(id).toBe('msg_root');
    expect(change.set.hub_state).toBe('claimed');
    expect(change.set.hub_claimant).toBe('codex');
    const reply = calls.find(c => c.kind === 'reply');
    expect(reply).toBeTruthy();
  });

  it('done: takes a real 60s claim, completes it and labels hub_state', async () => {
    const { team, calls } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer = new MirrorWriter(team as never);
    const out = await writer.apply(
      row({
        stage: 'done',
        status: 'done',
        actor: 'codex',
        result: 'verified 3 claims',
      })
    );
    expect(out.action).toBe('done');
    const claim = calls.find(c => c.kind === 'tasks.claim');
    expect(claim).toBeTruthy();
    expect(claim!.args).toEqual(['msg_root', { lease: 60 }]);
    expect(calls.find(c => c.kind === 'complete')?.args).toEqual([
      'verified 3 claims',
    ]);
    const label = calls.find(c => c.kind === 'label')?.args[1] as {
      set: Record<string, string>;
    };
    expect(label.set.hub_state).toBe('done');
  });

  it('failed: claims, fails with the reason, labels hub_state=failed', async () => {
    const { team, calls } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer = new MirrorWriter(team as never);
    await writer.apply(
      row({ stage: 'failed', status: 'failed', result: 'upstream 500' })
    );
    expect(calls.find(c => c.kind === 'fail')?.args).toEqual(['upstream 500']);
    const label = calls.find(c => c.kind === 'label')?.args[1] as {
      set: Record<string, string>;
    };
    expect(label.set.hub_state).toBe('failed');
  });

  it('cancelled: tasks.cancel + label; lease_expired reopens with a reply', async () => {
    const { team, calls } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer = new MirrorWriter(team as never);
    await writer.apply(
      row({ stage: 'cancelled', status: 'cancelled', actor: 'summer' })
    );
    expect(calls.find(c => c.kind === 'tasks.cancel')).toBeTruthy();
    const cancelLabel = calls.filter(c => c.kind === 'label')[0]?.args[1] as {
      set: Record<string, string>;
    };
    expect(cancelLabel.set.hub_state).toBe('cancelled');

    const { team: team2, calls: calls2 } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer2 = new MirrorWriter(team2 as never);
    await writer2.apply(
      row({ stage: 'lease_expired', actor: 'codex', status: 'open' })
    );
    const label = calls2.find(c => c.kind === 'label')?.args[1] as {
      set: Record<string, string>;
    };
    expect(label.set.hub_state).toBe('open');
    expect(calls2.some(c => c.kind === 'reply')).toBe(true);
  });

  it('reassigned relabels the assignee; unknown stages still reply', async () => {
    const { team, calls } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer = new MirrorWriter(team as never);
    await writer.apply(
      row({
        stage: 'reassigned',
        assignee: 'grokbot',
        note: 'from=pool to=grokbot',
      })
    );
    const label = calls.find(c => c.kind === 'label')?.args[1] as {
      set: Record<string, string>;
    };
    expect(label.set.hub_assignee).toBe('grokbot');
    expect(calls.some(c => c.kind === 'reply')).toBe(true);

    const { team: team2, calls: calls2 } = fakeTeam({
      tasks: [{ message: { id: 'msg_root' } }],
    });
    const writer2 = new MirrorWriter(team2 as never);
    const out = await writer2.apply(row({ stage: 'teleported' }));
    expect(out.action).toBe('unknown-stage:teleported');
    expect(calls2.some(c => c.kind === 'reply')).toBe(true);
  });

  it('resolves question roots through message label search when no task matches', async () => {
    const { team, calls } = fakeTeam({
      tasks: [],
      messages: [
        { id: 'msg_reply', re: 'msg_root', labels: { hub_id: 'fc-1' } },
        { id: 'msg_root', re: null, labels: { hub_id: 'fc-1' } },
      ],
    });
    const writer = new MirrorWriter(team as never);
    await writer.apply(
      row({
        stage: 'answered',
        type: 'question',
        answers: [{ from: 'claude', at: 2, text: 'main' }],
      })
    );
    const label = calls.find(c => c.kind === 'reply');
    expect(label).toBeTruthy();
    expect(label!.args[0]).toBe('msg_root');
  });
});
