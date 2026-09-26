// model-outcomes/v1 ledger: replay outcomes keyed by case, so re-running a
// case replaces its entry instead of double-counting. Aggregates are recomputed
// from cases and read by the canonical router via GEM_MODEL_OUTCOMES.

export const LEDGER_SCHEMA = 'model-outcomes/v1';

export function emptyLedger() {
  return { schema: LEDGER_SCHEMA, updatedAt: null, cases: {}, outcomes: {} };
}

export function aggregate(cases) {
  const outcomes = {};
  for (const entry of Object.values(cases)) {
    for (const o of entry.outcomes ?? []) {
      const byCapability = (outcomes[o.modelId] ??= {});
      const row = (byCapability[o.capability] ??= {
        attempts: 0,
        successes: 0,
        tokens_in: 0,
        tokens_out: 0,
        minutes: 0,
      });
      row.attempts += 1;
      row.successes += o.success ? 1 : 0;
      row.tokens_in += Number(o.tokensIn) || 0;
      row.tokens_out += Number(o.tokensOut) || 0;
      row.minutes += Number(o.minutes) || 0;
    }
  }
  return outcomes;
}

/** Merge new per-case outcomes into a ledger; cases absent from `updates` are kept. */
export function mergeLedger(ledger, updates, now = new Date().toISOString()) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : emptyLedger();
  const cases = { ...base.cases };
  for (const [caseId, entry] of Object.entries(updates)) {
    cases[caseId] = entry;
  }
  return {
    schema: LEDGER_SCHEMA,
    updatedAt: now,
    cases,
    outcomes: aggregate(cases),
  };
}
