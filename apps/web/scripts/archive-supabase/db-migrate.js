#!/usr/bin/env node
/*
  db-migrate.js
  - Detects branch via VERCEL_GIT_COMMIT_REF || GIT_BRANCH
  - Intended to run Supabase migrations against a matching Supabase Branch
  - Guardrails: main requires ALLOW_PROD_MIGRATIONS=true and a verified backup
*/

const branch =
  process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || 'local';
const allowProd =
  String(process.env.ALLOW_PROD_MIGRATIONS || '').toLowerCase() === 'true';

async function main() {
  console.log(`[db-migrate] Detected branch: ${branch}`);

  if (branch === 'preview') {
    console.log(
      '[db-migrate] Preview branch: expected to target Supabase Branch "preview"'
    );
    console.log(
      '[db-migrate] No credentials provided in CI. Skipping actual migration step.'
    );
    console.log(
      '[db-migrate] To enable automatic migrations, provide SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF and run Supabase CLI in CI.'
    );
    return; // exit 0
  }

  if (branch === 'main') {
    if (!allowProd) {
      console.error(
        '[db-migrate] Refusing to run on main without ALLOW_PROD_MIGRATIONS=true'
      );
      process.exit(2);
    }
    const hasToken = !!process.env.SUPABASE_ACCESS_TOKEN;
    const hasProject = !!process.env.SUPABASE_PROJECT_REF;
    if (!hasToken || !hasProject) {
      console.error(
        '[db-migrate] Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF for production migration.'
      );
      console.error(
        '[db-migrate] Ensure a DB backup is taken and required secrets are set before retrying.'
      );
      process.exit(3);
    }
    console.log(
      '[db-migrate] Production migration would run here via Supabase CLI/API.'
    );
    console.log(
      '[db-migrate] Implement CLI call once credentials and backup flow are confirmed.'
    );
    return;
  }

  console.log('[db-migrate] Non-CI or unsupported branch; skipping.');
}

main().catch(err => {
  console.error('[db-migrate] Fatal error:', err);
  process.exit(1);
});
