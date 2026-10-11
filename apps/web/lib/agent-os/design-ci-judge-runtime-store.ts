import 'server-only';

import {
  type DesignCiJudgeCellInput,
  DesignCiJudgeCertificationStore,
} from '@/lib/agent-os/design-ci-judge-certification';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';

let runtimeStore: DesignCiJudgeCertificationStore | null = null;

export function getDesignCiJudgeCertificationStore(): DesignCiJudgeCertificationStore {
  runtimeStore ??= new DesignCiJudgeCertificationStore(postgresRecordBackend());
  return runtimeStore;
}

export async function upsertDesignCiJudgeCells(
  cells: readonly DesignCiJudgeCellInput[],
  evaluatedAt?: string
) {
  return getDesignCiJudgeCertificationStore().upsertCells(cells, evaluatedAt);
}
