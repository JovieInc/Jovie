import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { insertChatCapabilityWants } from '@/lib/waitlist/capability-wants.server';

function fixture() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as DbOrTransaction, insert, values };
}

describe('chat capability wants', () => {
  it('retains the question kind when answers have padding or identical text', async () => {
    const { tx, values } = fixture();
    await insertChatCapabilityWants(tx, 'entry-1', {
      currentWorkflow: '  same words ',
      biggestBlocker: ' same words  ',
      launchGoal: 'same words',
    });
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'current_tool', text: 'same words' }),
      expect.objectContaining({ kind: 'objection', text: 'same words' }),
      expect.objectContaining({ kind: 'want', text: 'same words' }),
    ]);
  });

  it('does not invent wants for missing or whitespace-only answers', async () => {
    const { tx, insert } = fixture();
    await insertChatCapabilityWants(tx, 'entry-1', null);
    await insertChatCapabilityWants(tx, 'entry-1', { biggestBlocker: '  ' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('propagates a persistence failure to the surrounding transaction', async () => {
    const { tx, values } = fixture();
    values.mockRejectedValue(new Error('fixture write rejected'));
    await expect(
      insertChatCapabilityWants(tx, 'entry-1', { launchGoal: 'my launch' })
    ).rejects.toThrow('fixture write rejected');
  });
});
