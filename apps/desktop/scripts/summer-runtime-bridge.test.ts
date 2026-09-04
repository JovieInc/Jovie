import { describe, expect, it, vi } from 'vitest';
import {
  createSummerRuntimeBridge,
  invokeSummerRuntime,
  parseSummerRuntimeCompletion,
  SUMMER_LOCAL_RUNTIME_ERROR,
  SUMMER_LOCAL_RUNTIME_STATUS,
} from '../src/summer-runtime-bridge';

const claimedTurn = {
  id: 'turn_retired',
  conversation_id: 'founder-conversation',
  user_text: 'Founder prompt',
  claim_token: 'claim_retired',
};

describe('retired local Summer runtime bridge', () => {
  it('fails closed without invoking any local executable', async () => {
    const spawnProcess = vi.fn();
    await expect(
      invokeSummerRuntime({
        homeDirectory: '/Users/founder',
        turn: claimedTurn,
        spawnProcess,
      })
    ).rejects.toThrow(SUMMER_LOCAL_RUNTIME_ERROR);
    expect(SUMMER_LOCAL_RUNTIME_STATUS).toBe('retired-awaiting-eve');
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('does not poll, claim, or complete a server turn on macOS', async () => {
    const fetch = vi.fn();
    const onReceipt = vi.fn();
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      onReceipt,
    });

    await expect(bridge.runCycle()).resolves.toEqual({
      cycle: 1,
      state: 'runtime-error',
      errorCode: SUMMER_LOCAL_RUNTIME_ERROR,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(onReceipt).toHaveBeenCalledOnce();
  });

  it('emits one retired receipt when started and can be stopped safely', async () => {
    const onReceipt = vi.fn();
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch: vi.fn(),
      onReceipt,
    });

    bridge.start();
    bridge.start();
    await vi.waitFor(() => expect(onReceipt).toHaveBeenCalledOnce());
    bridge.stop();
    bridge.start();
    await vi.waitFor(() => expect(onReceipt).toHaveBeenCalledTimes(2));
  });

  it('stays idle off macOS without contacting the server', async () => {
    const fetch = vi.fn();
    const bridge = createSummerRuntimeBridge({
      platform: 'linux',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-linux',
      fetch,
    });
    await expect(bridge.runCycle()).resolves.toEqual({
      cycle: 1,
      state: 'idle',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps historical completion parsing data-only', () => {
    const stdout = [
      'Historical response.',
      '```summer-tool',
      JSON.stringify({
        name: 'search_gbrain',
        ok: true,
        receiptId: 'tool_old_1',
        summary: 'historical read-only receipt',
      }),
      '```',
    ].join('\n');
    expect(parseSummerRuntimeCompletion(stdout)).toEqual({
      responseText: 'Historical response.',
      tool: {
        name: 'search_gbrain',
        ok: true,
        receiptId: 'tool_old_1',
        summary: 'historical read-only receipt',
      },
    });
    expect(parseSummerRuntimeCompletion('plain text')).toEqual({
      responseText: 'plain text',
    });
  });
});
