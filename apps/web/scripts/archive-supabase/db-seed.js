#!/usr/bin/env node
/*
  db-seed.js
  - Seeds minimal dataset for the preview branch only
*/

const branch =
  process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || 'local';

async function main() {
  console.log(`[db-seed] Detected branch: ${branch}`);

  if (branch !== 'preview') {
    console.log('[db-seed] Skipping: only seeds on preview branch');
    return; // exit 0
  }

  console.log('[db-seed] Would seed preview dataset here (placeholder).');
  console.log(
    '[db-seed] Provide service role key and use Supabase client or SQL to insert sample records.'
  );
}

main().catch(err => {
  console.error('[db-seed] Fatal error:', err);
  process.exit(1);
});
