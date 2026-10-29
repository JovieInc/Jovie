import 'server-only';

import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { DogfoodJudgeLedger } from './dogfood-judge-ledger';

let runtimeLedger: DogfoodJudgeLedger | null = null;

export function getDogfoodJudgeLedger(): DogfoodJudgeLedger {
  runtimeLedger ??= new DogfoodJudgeLedger(postgresRecordBackend());
  return runtimeLedger;
}
