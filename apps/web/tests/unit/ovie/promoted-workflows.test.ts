import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOvieReceiptLog, resetOvieIngestLog } from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { applyOvieDump } from '@/lib/ovie/persist';
import {
  applyEveWorkflowContractPatch,
  CODE_WORK_ROUTING,
  disablePromotedDumpAck,
  EveWorkflowContractMutationError,
  enablePromotedDumpAck,
  evaluateSummerWorkflowCandidate,
  executePromotedDumpAck,
  getPromotedDumpAckSnapshot,
  listPromotedDumpAckReceipts,
  listPromotedSummerWorkflows,
  PROMOTED_DUMP_ACK_CONTRACT,
  PROMOTED_DUMP_ACK_VERSION_ID,
  PROMOTED_DUMP_ACK_WORKFLOW_ID,
  resetPromotedDumpAckRuntime,
  SUMMER_WORKFLOW_INVENTORY,
} from '@/lib/ovie/promoted-workflows';

const { mockWrite, mockReleaseLock } = vi.hoisted(() => ({
  mockWrite: vi.fn(),
  mockReleaseLock: vi.fn(),
}));

vi.mock('workflow', () => ({
  getWritable: () => ({
    getWriter: () => ({
      write: mockWrite,
      releaseLock: mockReleaseLock,
    }),
  }),
}));

describe('Summer workflow promotion (JOV-5217)', () => {
  beforeEach(() => {
    resetPromotedDumpAckRuntime();
    resetOvieIngestLog();
    vi.clearAllMocks();
    mockWrite.mockResolvedValue(undefined);
  });

  it('promotes only the proven dump-ack workflow and rejects discretionary candidates', () => {
    const promoted = listPromotedSummerWorkflows();
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.id).toBe('ovie-dump-ack');
    expect(promoted[0]?.discretionaryPrioritization).toBe(false);
    expect(promoted[0]?.ambiguousBroadAuthority).toBe(false);
    expect(promoted[0]?.recurrenceEvidence).toContain('JOV-5215');

    expect(
      SUMMER_WORKFLOW_INVENTORY.filter(
        candidate => candidate.decision === 'reject'
      ).map(candidate => candidate.id)
    ).toEqual(
      expect.arrayContaining([
        'priority-triage',
        'goal-selection',
        'policy-change',
        'permission-expansion',
        'symphony-discretion',
        'self-promotion',
      ])
    );
    expect(evaluateSummerWorkflowCandidate('priority-triage')?.reason).toMatch(
      /discretionary/i
    );
    expect(
      evaluateSummerWorkflowCandidate('symphony-discretion')?.reason
    ).toMatch(/Symphony/i);
  });

  it('freezes the promoted contract so Eve cannot mutate it', () => {
    expect(Object.isFrozen(PROMOTED_DUMP_ACK_CONTRACT)).toBe(true);
    expect(Object.isFrozen(PROMOTED_DUMP_ACK_CONTRACT.retryPolicy)).toBe(true);
    expect(PROMOTED_DUMP_ACK_CONTRACT.owner).toBe('summer');
    expect(PROMOTED_DUMP_ACK_CONTRACT.promotionStatus).toBe('promoted');
    expect(() =>
      applyEveWorkflowContractPatch({
        costCeilingUsd: 99,
        promotionStatus: 'self-promoted',
        retryPolicy: { maxAttempts: 99, backoffMs: 1 },
      })
    ).toThrow(EveWorkflowContractMutationError);
    expect(PROMOTED_DUMP_ACK_CONTRACT.costCeilingUsd).toBe(0);
    expect(PROMOTED_DUMP_ACK_CONTRACT.retryPolicy.maxAttempts).toBe(3);
    expect(CODE_WORK_ROUTING).toMatchObject({
      authority: 'summer',
      orchestrator: 'symphony',
      executionHost: 'gem',
      identifiedWorkerRequired: true,
      eveMayInvokeSymphony: false,
    });
  });

  it('executes dump-ack with stable ids and a redacted Summer receipt', () => {
    const receipt = executePromotedDumpAck({
      workId: 'work_dump_1',
      items: [
        'file JOV-5217 with token sk-live-supersecret and user ada@jov.ie',
        'Jovie signup returns 500 on /start',
      ],
    });

    expect(receipt.workId).toBe('work_dump_1');
    expect(receipt.workflowId).toBe(PROMOTED_DUMP_ACK_WORKFLOW_ID);
    expect(receipt.versionId).toBe(PROMOTED_DUMP_ACK_VERSION_ID);
    expect(receipt.status).toBe('completed');
    expect(receipt.owner).toBe('summer');
    expect(receipt.orchestrator).toBe('symphony');
    expect(receipt.executionHost).toBe('gem');
    expect(receipt.eveInvokedSymphony).toBe(false);
    expect(receipt.eveSelectedWorker).toBe(false);
    expect(receipt.items.some(item => item.text.includes('sk-live'))).toBe(
      false
    );
    expect(receipt.items.some(item => item.text.includes('ada@jov.ie'))).toBe(
      false
    );
    expect(
      receipt.items.some(item => item.text.includes('[redacted-email]'))
    ).toBe(true);
    expect(receipt.items.some(item => item.lane === 'engineering')).toBe(true);
    expect(readOvieReceiptLog()).toHaveLength(2);
    expect(listPromotedDumpAckReceipts()[0]).toEqual(receipt);
  });

  it('is idempotent on duplicate work/sequence and ignores out-of-order replay', () => {
    const first = executePromotedDumpAck({
      workId: 'work_dup',
      items: ['post this tweet'],
      sequence: 2,
    });
    const duplicate = executePromotedDumpAck({
      workId: 'work_dup',
      items: ['post this tweet'],
      sequence: 2,
    });
    const outOfOrder = executePromotedDumpAck({
      workId: 'work_dup',
      items: ['older dump'],
      sequence: 1,
    });

    expect(first.status).toBe('completed');
    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.workId).toBe(first.workId);
    expect(outOfOrder.status).toBe('ignored_out_of_order');
    expect(readOvieReceiptLog()).toHaveLength(1);
  });

  it('times out, compensates persist failure, and recovers on replay', () => {
    let t = 0;
    const timedOut = executePromotedDumpAck(
      { workId: 'work_to', items: ['research eval dogfood'] },
      {
        now: () => {
          const current = t;
          t += 6_000;
          return current;
        },
      }
    );
    expect(timedOut.status).toBe('timed_out');
    expect(readOvieReceiptLog()).toHaveLength(0);

    const compensated = executePromotedDumpAck(
      { workId: 'work_to', items: ['research eval dogfood'], sequence: 1 },
      {
        persist: () => {
          throw new Error('persist failed');
        },
      }
    );
    expect(compensated.status).toBe('compensated');
    expect(readOvieReceiptLog()).toHaveLength(0);

    const recovered = executePromotedDumpAck({
      workId: 'work_to',
      items: ['research eval dogfood'],
      sequence: 2,
    });
    expect(recovered.status).toBe('completed');
    expect(readOvieReceiptLog()).toHaveLength(1);
  });

  it('can be disabled without losing durable intake or Summer authority', async () => {
    executePromotedDumpAck({
      workId: 'work_keep',
      items: ['post this tweet'],
    });
    disablePromotedDumpAck();

    const disabled = executePromotedDumpAck({
      workId: 'work_new',
      items: ['another dump'],
    });
    expect(disabled.status).toBe('disabled');
    expect(getPromotedDumpAckSnapshot()).toMatchObject({
      owner: 'summer',
      enabled: false,
      promotionStatus: 'promoted',
      eveCannotMutate: true,
    });
    expect(
      listPromotedDumpAckReceipts().some(
        receipt => receipt.workId === 'work_keep'
      )
    ).toBe(true);

    const store = new MemoryOperatingStore();
    const intake = await applyOvieDump(['research eval dogfood'], { store });
    expect(intake).toHaveLength(1);
    expect(await store.listInitiatives()).toHaveLength(1);

    enablePromotedDumpAck();
    const resumed = executePromotedDumpAck({
      workId: 'work_resume',
      items: ['post this tweet'],
    });
    expect(resumed.status).toBe('completed');
    expect(resumed.owner).toBe('summer');
  });

  it('emits the redacted receipt through the Vercel workflow writable', async () => {
    const { emitOvieDumpAckReceipt } = await import(
      '@/workflows/ovie-dump-ack'
    );
    const receipt = await emitOvieDumpAckReceipt({
      workId: 'work_wdk',
      items: ['post this tweet'],
    });

    expect(receipt.status).toBe('completed');
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith({
      type: 'summer_audit_receipt',
      receipt,
    });
    expect(mockReleaseLock).toHaveBeenCalledTimes(1);
  });
});
