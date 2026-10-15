#!/usr/bin/env tsx
import { parseArgs } from 'node:util';
import {
  audienceOwnerBackfillOptions,
  backfillAudienceActionOwners,
  reconcileAudienceActionOwners,
} from '@/lib/db/audience-action-owners';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      cursor: { type: 'string' },
      limit: { type: 'string', default: '100' },
      'profile-id': { type: 'string' },
    },
  });
  const options = audienceOwnerBackfillOptions.parse({
    profileId: values['profile-id'],
    cursor: values.cursor ?? null,
    limit: Number(values.limit),
    apply: values.apply,
  });
  const report = await withSystemIngestionSession(async tx => {
    const batch = await backfillAudienceActionOwners(tx, options);
    const reconciliation = await reconcileAudienceActionOwners(
      tx,
      options.profileId
    );
    return {
      mode: options.apply ? 'apply' : 'dry-run',
      ...batch,
      ...reconciliation,
    };
  });
  console.log(JSON.stringify(report));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
