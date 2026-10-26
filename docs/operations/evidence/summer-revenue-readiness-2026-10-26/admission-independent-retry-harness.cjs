const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('/workspace/Jovie/node_modules/typescript');
const root = '/workspace/Jovie/';
function load(relative, mocks) {
  const source = fs.readFileSync(root + relative, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: name => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console,
    setTimeout,
    Date,
    crypto: crypto.webcrypto,
  };
  vm.runInNewContext(outputText, sandbox, { filename: relative });
  return {
    exports: module.exports,
    digest: crypto.createHash('sha256').update(source).digest('hex'),
  };
}
let ready = true,
  attempts = 0,
  approvals = 0,
  invites = 0,
  reservations = 0,
  readinessReads = 0;
const entry = {
  id: 'synthetic-review-entry',
  email: 'review@example.test',
  status: 'waitlisted',
};
const user = { id: 'synthetic-review-user', userStatus: 'waitlist_pending' };
function query(rows) {
  const q = {
    from: () => q,
    where: () => q,
    orderBy: () => q,
    for: () => q,
    limit: async () => rows,
    then: (a, b) => Promise.resolve(rows).then(a, b),
  };
  return q;
}
const retry = load('apps/web/lib/db/serializable-retry.ts', {
  'server-only': {},
  '@/lib/errors/onboarding': { unwrapDatabaseError: x => x },
}).exports.withSerializableRetry;
const calls = new Proxy(
  {},
  {
    get: (_, name) =>
      name === 'sql' ? () => ({}) : (...args) => ({ name, args }),
  }
);
const loaded = load('apps/web/lib/waitlist/auto-accept.ts', {
  'server-only': {},
  'drizzle-orm': calls,
  '@/lib/acquisition/eligibility.server': {
    readCachedAcquisitionEligibility: async () => {
      readinessReads++;
      return ready ? { eligible: true, verdict: 'ELIGIBLE' } : null;
    },
  },
  '@/lib/acquisition/eligibility-cache': {
    readCachedAcquisitionEligibility: async () => {
      readinessReads++;
      return ready ? { eligible: true, verdict: 'ELIGIBLE' } : null;
    },
  },
  '@/lib/canaries/production-waitlist': {
    hasProductionWaitlistCanaryNamespace: () => false,
  },
  '@/lib/db': {
    db: {
      select: projection =>
        query(
          'emailHash' in projection || 'userStatus' in projection ? [] : [entry]
        ),
    },
  },
  '@/lib/db/schema/auth': { users: {} },
  '@/lib/db/schema/suppression': { emailSuppressions: {} },
  '@/lib/db/schema/waitlist': { waitlistEntries: {} },
  '@/lib/db/serializable-retry': {
    withSerializableRetry: fn =>
      retry(fn, {
        sleep: async () => {
          ready = false;
        },
      }),
  },
  '@/lib/ingestion/session': {
    withSystemIngestionSession: async operation => {
      attempts++;
      if (attempts === 1)
        throw Object.assign(new Error('seeded serialization conflict'), {
          code: '40001',
        });
      return operation({
        select: projection =>
          query('userStatus' in projection ? [user] : [entry]),
      });
    },
  },
  '@/lib/notifications/suppression': { hashEmail: x => x },
  '@/lib/utils/logger': { logger: { warn: () => {} } },
  '@/lib/waitlist/approval': {
    approveWaitlistEntryInTx: async () => {
      approvals++;
      return { outcome: 'approved', entryId: entry.id };
    },
    finalizeWaitlistApproval: async () => {},
  },
  '@/lib/waitlist/cohort-learnings': {
    countOpenCohortLearnings: async () => 0,
    MAX_OPEN_COHORT_LEARNINGS: 10,
  },
  '@/lib/waitlist/email-jobs': {
    enqueueWaitlistApprovalInviteEmail: async () => {
      invites++;
    },
  },
  '@/lib/waitlist/settings': {
    getWaitlistSettings: async () => ({
      autoAcceptEnabled: true,
      autoAcceptDailyLimit: 5,
      autoAcceptedToday: 0,
      autoAcceptAfterDays: 7,
    }),
    tryReserveAutoAcceptSlot: async () => {
      reservations++;
      return { shouldAutoAccept: true, reason: 'reserved' };
    },
  },
});
(async () => {
  const result = await loaded.exports.runWaitlistAutoAccept();
  const pass =
    approvals === 0 &&
    invites === 0 &&
    reservations === 0 &&
    result.pausedReason === 'golden_path_not_green';
  console.log(
    JSON.stringify(
      {
        schema: 'jovie.independent-adverse-check/v1',
        observedAt: new Date().toISOString(),
        sourceSha256: loaded.digest,
        scope:
          'isolated source unit harness with mocked external dependencies and real serializable retry implementation',
        scenario:
          'First transaction fails with SQLSTATE 40001; readiness revoked during actual retry backoff callback',
        expected: {
          approvals: 0,
          invites: 0,
          reservations: 0,
          pausedReason: 'golden_path_not_green',
        },
        actual: {
          attempts,
          readinessReads,
          approvals,
          invites,
          reservations,
          result,
        },
        status: pass ? 'PASS' : 'FAIL',
        testTotals: {
          total: 1,
          passed: Number(pass),
          failed: Number(!pass),
          skipped: 0,
        },
      },
      null,
      2
    )
  );
  process.exitCode = pass ? 0 : 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
