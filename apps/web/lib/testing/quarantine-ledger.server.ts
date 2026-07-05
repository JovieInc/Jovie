import 'server-only';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildQuarantineLedgerSummary,
  type ParsedQuarantineLedger,
  parseQuarantineLedger,
  type QuarantineLedgerSummary,
} from '@/lib/testing/quarantine-ledger';

const QUARANTINE_LEDGER_PATH = resolve(process.cwd(), 'tests/quarantine.json');

export interface HudQuarantineMetrics {
  readonly ledgerPath: string;
  readonly summary: QuarantineLedgerSummary;
  readonly entries: ParsedQuarantineLedger['ledger']['entries'];
  readonly retryBudget: ParsedQuarantineLedger['ledger']['retryBudget'];
  readonly isValid: boolean;
  readonly validationIssues: ParsedQuarantineLedger['issues'];
}

export function getQuarantineLedgerPath(): string {
  return QUARANTINE_LEDGER_PATH;
}

export function loadQuarantineLedgerFromFile(
  filePath = QUARANTINE_LEDGER_PATH
): ParsedQuarantineLedger {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  return parseQuarantineLedger(raw);
}

export function getHudQuarantineMetrics(
  filePath = QUARANTINE_LEDGER_PATH
): HudQuarantineMetrics {
  try {
    const parsed = loadQuarantineLedgerFromFile(filePath);
    return {
      ledgerPath: filePath,
      summary: parsed.summary,
      entries: parsed.ledger.entries,
      retryBudget: parsed.ledger.retryBudget,
      isValid: parsed.issues.length === 0,
      validationIssues: parsed.issues,
    };
  } catch {
    return {
      ledgerPath: filePath,
      summary: buildQuarantineLedgerSummary({
        entries: [],
        retryBudget: {
          unitDefaultRetries: 1,
          quarantineUnitRetries: 2,
          e2eDefaultRetries: 0,
          quarantineE2eRetries: 2,
          maxRetryAttemptsPerCiRun: 120,
          unitShardCount: 6,
        },
      }),
      entries: [],
      retryBudget: {
        unitDefaultRetries: 1,
        quarantineUnitRetries: 2,
        e2eDefaultRetries: 0,
        quarantineE2eRetries: 2,
        maxRetryAttemptsPerCiRun: 120,
        unitShardCount: 6,
      },
      isValid: false,
      validationIssues: [
        {
          path: filePath,
          message: 'Failed to read or parse quarantine ledger',
        },
      ],
    };
  }
}
