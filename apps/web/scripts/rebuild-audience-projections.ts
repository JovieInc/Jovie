#!/usr/bin/env tsx
import { parseArgs } from 'node:util';
import {
  audienceProjectionOptions,
  rebuildAudienceProjections,
} from '@/lib/db/rebuild-audience-projections';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      cursor: { type: 'string' },
      limit: { type: 'string', default: '10' },
      'profile-id': { type: 'string' },
    },
  });
  const options = audienceProjectionOptions.parse({
    profileId: values['profile-id'],
    cursor: values.cursor ?? null,
    limit: Number(values.limit),
    apply: values.apply,
  });
  const report = await withSystemIngestionSession(tx =>
    rebuildAudienceProjections(tx, options)
  );
  console.log(
    JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...report })
  );
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
