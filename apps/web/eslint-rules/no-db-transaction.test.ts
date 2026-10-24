import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;
new RuleTester().run('no-db-transaction', require('./no-db-transaction.js'), {
  valid: [
    'runAtomicDbOperation(operation, { actorId, retry: "never" })',
    'db.insert(table).values([row])',
    'db.select().from(table)',
    {
      filename: '/repo/lib/db/legacy-transaction.ts',
      code: 'db.transaction(operation)',
    },
    {
      filename: '/repo/lib/db/client/connection.ts',
      code: 'createDbInstance(client).transaction(operation, config)',
    },
  ],
  invalid: [
    ...['db.transaction(operation)', 'tx.transaction(operation)'].map(code => ({
      code,
      errors: [{ messageId: 'noTransaction' }],
    })),
    ...[
      'db.transaction(operation)',
      'tx.transaction(operation)',
      'createDbInstance(pool).transaction(operation, config)',
      'createDbInstance(client).transaction(otherOperation, config)',
    ].map(code => ({
      filename: '/repo/lib/db/client/connection.ts',
      code,
      errors: [{ messageId: 'noTransaction' }],
    })),
    {
      filename: '/repo/lib/waitlist/approval.ts',
      code: 'createDbInstance(client).transaction(operation, config)',
      errors: [{ messageId: 'noTransaction' }],
    },
  ],
});
