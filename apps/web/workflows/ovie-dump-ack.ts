import { getWritable } from 'workflow';
import {
  executePromotedDumpAck,
  type PromotedDumpAckInput,
  type PromotedDumpAckReceipt,
} from '@/lib/ovie/promoted-workflows';

export type OvieDumpAckWorkflowEvent = {
  readonly type: 'summer_audit_receipt';
  readonly receipt: PromotedDumpAckReceipt;
};

export async function emitOvieDumpAckReceipt(
  input: PromotedDumpAckInput
): Promise<PromotedDumpAckReceipt> {
  'use step';

  const receipt = executePromotedDumpAck(input);
  const writer = getWritable<OvieDumpAckWorkflowEvent>().getWriter();

  try {
    await writer.write({ type: 'summer_audit_receipt', receipt });
  } finally {
    writer.releaseLock();
  }

  return receipt;
}

export async function ovieDumpAckWorkflow(
  input: PromotedDumpAckInput
): Promise<PromotedDumpAckReceipt> {
  'use workflow';

  return emitOvieDumpAckReceipt(input);
}
