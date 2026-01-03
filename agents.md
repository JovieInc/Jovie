# Agents Guide (Jovie)

This file defines how AI agents (Claude, Codex, Copilot, etc.) work in this repo so we ship fast while keeping `main` clean.

## Quickstart for AI agents

- **Single source of truth:** Treat this file as the canonical ruleset for all AI agents in this repo.
- **Analytics & flags:** Use **Statsig only** via the existing wrappers; do not introduce PostHog, Segment, RudderStack, or other analytics SDKs.
- **Branches & PRs:** Always work on feature branches from `main` and follow sections 1–2 for branching and PR expectations.
- **Guardrails:** Before making product changes, skim sections 8–13 for architecture, runtime/auth/DB rules, testing expectations, and CI/CD/landmine guidance.

## ⛔ CRITICAL: Protected Branch Rules

**AI agents must follow these rules for the `main` branch:**

- PRs to `main` require passing CI checks before merge
- Auto-merge is allowed for low-risk PRs with `auto-merge` label
- High-risk changes (database migrations, auth changes) require human review
- Never force-push or modify branch protection rules

**AI agents may:**

- Create PRs targeting `main`
- Merge PRs to `main` (with auto-merge label, after CI passes)
- Monitor CI status on PRs

**Human review required for:**

- Database schema migrations
- Authentication/authorization changes
- Payment/billing changes
- Core user flow modifications

## ⛔ CRITICAL: Repository Settings & Branch Protection Prohibition

**AI agents must NEVER modify repository settings, branch protection rules, or rulesets.**

This includes:

- Modifying branch protection rules via GitHub API or CLI
- Changing ruleset configurations (`.github/rulesets/*.yml`)
- Disabling or bypassing linear history requirements
- Adding admin bypass permissions
- Modifying required status checks
- Changing merge method restrictions (squash, rebase, merge)
- Any `gh api` calls that modify repository or branch settings

**Repository configuration changes require explicit human approval.** If a workflow or process requires a settings change, AI agents must:

1. Document the proposed change and rationale
2. Request human approval before proceeding
3. Never execute the change autonomously

Violations of this rule can cause merge conflicts, break CI/CD pipelines, and compromise repository integrity.

## 0. Analytics & Feature Flags (Statsig-only)

- Statsig is the **only** product analytics and feature flag platform used in this repo.
- Do **not** add or reintroduce PostHog, Segment, RudderStack, or any other analytics/flags SDKs.
- Use Statsig feature gates/experiments for non-essential flows; leave MVP-critical flows ungated unless explicitly flagged.

### Feature Gate Workflow

**When creating a new feature flag:**

1. **Add to code constants** (`lib/statsig/flags.ts`):

   ```typescript
   export const STATSIG_FLAGS = {
     // ... existing flags
     NEW_FEATURE: "feature_new_feature",
   } as const;
   ```

2. **Create gate in Statsig** using one of these methods:

   - **Recommended**: Use the Statsig MCP server (configured in `.claude.json`)
     - Ask Claude Code to create the gate via MCP
     - Provide: gate name, description, default value, expiry (if temporary)
   - **Manual**: Create via [Statsig Console](https://console.statsig.com)
     - Navigate to Feature Gates → Create New Gate
     - Use exact name from `STATSIG_FLAGS` constant

3. **Document the gate** in `docs/STATSIG_FEATURE_GATES.md`:

   - Add entry with status, default, description, expiry, and usage locations
   - Update migration checklist if applicable

4. **Use in code**:

   ```typescript
   import { STATSIG_FLAGS } from "@/lib/statsig/flags";

   // Client-side
   const isEnabled = statsig.checkGate(STATSIG_FLAGS.NEW_FEATURE);

   // Server-side
   const isEnabled = await statsig.checkGateForUser(
     user,
     STATSIG_FLAGS.NEW_FEATURE
   );
   ```

### Statsig MCP Server

The Statsig MCP server is configured for Claude Code and enables:

- Programmatic gate creation and management
- Gate status checking and updates
- Experiment configuration
- Analytics event tracking

Configuration location: `.claude.json` (project-specific)

## 1. Branch & Environment Model

- **Feature branches**

  - **Base:** always branch from `main`.
  - **Naming:** `feat/<slug>`, `fix/<slug>`, `chore/<slug>` (3–6 word kebab-case slug).
  - **Never** push directly to `main`.

- **Long-lived branch (Trunk-Based Development)**

  - **`main`** - Single long-lived branch
    - Source of truth for all day-to-day development.
    - Must always be **green** on: `pnpm typecheck`, `pnpm lint`, `pnpm test`, basic E2E smoke.
    - **Deploys directly to production** at [jov.ie](https://jov.ie) on push.
    - Full CI runs on push: build, unit tests, E2E smoke, Drizzle checks, database migrations.
    - Canary health gate and smoke tests run after each deploy.

- **Neon Database Branches**
  - **`main`** - Primary production branch mapped to Git `main`.
  - **Ephemeral branches** - Auto-created per PR for full CI, auto-deleted on PR close (see neon-ephemeral-branch-cleanup.yml).

## 2. PR Expectations (All Agents)

- **Before opening a PR**

  - Start from latest `main`.
  - Keep scope tight: one user-visible outcome per PR.
  - Wrap new behavior behind a feature flag named `feature_<slug>` where appropriate.

- **When opening a PR**

  - **Base branch:** `main`.
  - **Title:** `type: subject` or `type(scope): subject` (conventional commit style, e.g., `feat: add user avatar` or `fix(auth): resolve login redirect`).
  - **Body includes:**
    - Goal (1–2 sentences).
    - KPI / outcome (if applicable).
    - Statsig events/experiments added/updated (no PostHog).
    - Rollback plan (usually "disable feature flag" or "revert PR").
  - Add label `auto-merge` when it is safe for CI + automation to merge once green.

- **Required checks for auto-merge into `main`**
  - Fast lane:
    - `pnpm typecheck` (CI job: Typecheck).
    - `pnpm lint` (CI job: Lint).
  - For higher-risk changes (DB, core flows), ensure full CI is enabled (`full-ci` label) so build, unit tests, Drizzle checks, and smoke E2E run.

## 3. Codex Auto-Fix CI

- **Trigger:**

  - Runs after the primary `CI` workflow **fails** on a PR into `main`.
  - Only for PRs from the same repo (no forks).

- **Behavior:**

  - Uses the Codex CLI to:
    - Read the repo and CI logs.
    - Apply minimal, targeted fixes so `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass.
  - Verifies checks locally inside the workflow.
  - Opens a dedicated `codex/auto-fix-<id>` branch + PR against the original feature branch.

- **Agent obligations:**
  - Do **not** fight Codex auto-fixes; incorporate them or adjust with a follow-up PR.
  - If Codex cannot safely fix an issue (complex refactor, product decision), add `needs-human` or `no-auto-merge` to halt automation.

## 4. Auto-Merge Rules

- Auto-merge is managed by `.github/workflows/auto-merge.yml`:
  - **Regular PRs:** auto-merge allowed when:
    - Base is `main`.
    - PR has `auto-merge` label.
    - CI checks configured for `main` are green.
    - No blocking labels: `blocked`, `human-review`, `no-auto-merge`, `claude:needs-fixes`, `needs-human`, `ai:fixing`, `ci:healing`.
  - **Dependabot:** auto-merge for patch/minor + security, subject to policy checks.
  - **Codegen/automation PRs:** auto-merge when labeled appropriately (e.g. `codegen`).

### 4.1 AI Automation Label Taxonomy

CodeRabbit automatically labels PRs based on review findings to trigger GitHub Actions workflows that automate fixes and CI healing. This keeps developers in flow state while maintaining code quality.

#### AI Automation Labels (Workflow Triggers)

**`ai:auto-fix`** - AI should attempt automatic fixes
- **Applied when**: CodeRabbit finds <10 minor issues (severity: info/style)
- **Triggers**: `.github/workflows/ai-auto-fix.yml`
- **Safe fixes only**: formatting, linting, simple type errors, unused imports
- **Protected paths excluded**: migrations, auth, payments (auto-labeled `ai:opt-out`)

**`ai:needs-review`** - Human review required (no auto-fix)
- **Applied when**: CodeRabbit finds warnings/errors that need human judgment
- **Examples**: logic errors, security issues, performance concerns
- **Action**: PR author notified, no automated changes

**`ai:fixing`** - AI is currently working (prevents loops)
- **Applied by**: AI auto-fix workflow when executing
- **Purpose**: Blocks other workflows/auto-merge while AI is working
- **Removed**: After fix succeeds or fails

**`ai:fixed`** - AI completed fixes successfully
- **Applied by**: AI auto-fix workflow on success
- **Indicates**: Safe fixes applied, ready for re-review
- **Next step**: CodeRabbit re-reviews, may auto-merge if clean

**`ai:failed`** - AI could not fix, human needed
- **Applied by**: AI auto-fix workflow on failure
- **Triggers**: PR comment explaining failure
- **Circuit breaker**: Max 3 auto-fix attempts per PR

**`ai:opt-out`** - Disable all AI automation for this PR
- **Applied when**: PR modifies protected paths (migrations, auth, payments, billing)
- **Also applies to**: Manual label addition by PR author
- **Effect**: Blocks ai-auto-fix and ci-auto-heal workflows

#### CI Auto-Heal Labels (Informational)

**`ci:auto-heal`** - Enable automatic CI failure recovery
- **Applied manually**: PR author opts into CI auto-heal
- **Default**: Auto-heal enabled for all PRs unless `ai:opt-out`

**`ci:healing`** - CI auto-heal in progress
- **Applied by**: CI auto-heal workflow when executing
- **Blocks**: Auto-merge while healing
- **Removed**: After heal succeeds or fails

**`ci:healed`** - CI auto-heal succeeded
- **Applied by**: CI auto-heal workflow on success
- **Examples**: Fixed cache corruption, re-ran flaky test, cleared node_modules

**`ci:manual`** - CI failure requires human intervention
- **Applied by**: CI auto-heal workflow when failure is not auto-healable
- **Examples**: Test logic failures, build errors, migration failures
- **Action**: PR author notified, manual fix required

#### Label Interaction Rules

**Auto-merge blocking labels** (updated):
- `blocked`, `human-review`, `no-auto-merge`, `claude:needs-fixes`, `needs-human`
- **New**: `ai:fixing`, `ci:healing` - blocks while automation in progress

**Protected path detection** (auto-labeled `ai:opt-out`):
- `drizzle/migrations/**`
- `**/auth/**`, `**/payment/**`, `**/billing/**`
- `.github/workflows/**`

**Circuit breakers** (prevents runaway automation):
- Max 3 `ai:auto-fix` attempts per PR
- Max 2 `ci:auto-heal` attempts per PR
- Exponential backoff between retries

#### Workflow Integration

```yaml
# Example: Auto-merge now respects AI automation state
if: |
  contains(github.event.pull_request.labels.*.name, 'automerge') &&
  !contains(github.event.pull_request.labels.*.name, 'ai:fixing') &&
  !contains(github.event.pull_request.labels.*.name, 'ci:healing')
```

See `.coderabbit.yaml` for full auto-labeling configuration and label-specific instructions.

## 5. Neon & Migrations

### 🚨 CRITICAL RULE: NEVER Manually Edit Migration Files

**Migration files (`.sql` files in `drizzle/migrations/`) are SACRED and must NEVER be manually created, edited, or modified.**

**✅ ONLY WAY to create/modify migrations:**
```bash
# 1. Modify your schema in lib/db/schema/
# 2. Generate migration via Drizzle Kit
pnpm drizzle:generate
```

**❌ FORBIDDEN ACTIONS:**
- Creating `.sql` files manually in `drizzle/migrations/`
- Editing existing `.sql` migration files
- Copying/pasting SQL into migration files
- Modifying `drizzle/migrations/meta/_journal.json` manually
- Using any tool other than `drizzle-kit generate` to create migrations

**Why this rule exists:**
1. **Hash verification:** Drizzle validates migration hashes - manual edits break the chain
2. **Journal sync:** `_journal.json` must match migration content exactly
3. **Schema drift:** Manual SQL can diverge from TypeScript schema definitions
4. **CI failures:** Pre-commit hooks and CI will block manually created/edited migrations
5. **Production safety:** Only Drizzle-generated migrations are guaranteed to be idempotent and safe

**Exception for EMERGENCY fixes (use ONLY when absolutely necessary):**
If you must manually fix a migration (e.g., production is broken):
1. Get explicit approval from team lead
2. Document the change in PR description
3. Regenerate the entire migration via `pnpm drizzle:generate` after fixing schema
4. Expect pre-commit hooks to catch and block manual changes

**AI Agents - EXCLUDE migration files from refactoring:**
- Migration files in `drizzle/migrations/*.sql` must be excluded from all refactoring tasks
- If you need to change database schema, modify `lib/db/schema/` and regenerate migrations
- NEVER suggest "let me fix this migration file" - always use Drizzle Kit

---

- **Do not** run Drizzle migrations manually in ad-hoc ways.
- **Do not** make direct DDL changes to the database - use Drizzle migrations only.
- **Long-lived branch:** Only `main` (trunk-based development).

### Database-Level Migration Protection

The database has an event trigger that **blocks direct DDL changes** to the public schema. This ensures all schema changes go through Drizzle migrations.

**What's blocked:**

- `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE` outside of migrations
- Direct index, sequence, or type modifications

**What's allowed:**

- Drizzle migrations (automatically detected via lock on `__drizzle_migrations`)
- Changes to the `drizzle` schema (migration tracking)

**Emergency bypass (use sparingly):**

```sql
SET app.allow_schema_changes = 'true';
-- Your emergency DDL here
```

**To install on a new database:**

```bash
psql $DATABASE_URL -f scripts/setup-migration-protection.sql
```

- CI is responsible for:
  - Creating per-PR Neon ephemeral DBs for full CI (auto-created, auto-deleted on PR close).
  - Running `drizzle:check` to validate schema changes before merge.
  - Running `pnpm run drizzle:migrate:prod` automatically on main deploys to production.
- Per PR:
  - Aim for **one migration per PR**.
  - Avoid destructive changes without a clear data-migration plan.
  - **Linear append-only migrations** - never edit or squash migrations **after they're merged to main**.

**IMPORTANT: When Squashing Is Safe**

- ✅ **Before merge to main**: Squash, edit, delete migrations freely on your feature branch
- ✅ **Local only**: If migrations haven't been pushed/shared, you control the history
- ❌ **After merge to main**: Append-only policy strictly enforced - NEVER modify
- ❌ **Shared branches**: If others are working on your branch, communicate before squashing

### 5.1 Migration Creation Workflow (CRITICAL)

**GOLDEN RULE: ALL migrations MUST be generated by Drizzle, NEVER manually created.**

When creating new database migrations, you **MUST** follow this exact process:

1. **Update your schema first:**

   ```typescript
   // lib/db/schema.ts
   export const myTable = pgTable("my_table", {
     id: uuid("id").primaryKey().defaultRandom(),
     newColumn: text("new_column"), // ← Add your changes here
   });
   ```

2. **Generate migration using Drizzle:**

   ```bash
   pnpm run drizzle:generate
   ```

   This command:

   - Reads your `lib/db/schema.ts` file
   - Compares with previous snapshot to detect changes
   - Creates a new `.sql` file in `drizzle/migrations/`
   - **Automatically updates `drizzle/migrations/meta/_journal.json`**
   - Generates a snapshot file in `drizzle/migrations/meta/`

3. **NEVER manually create migration files:**

   - ❌ **WRONG**: Write SQL in `0011_my_migration.sql` directly
   - ❌ **WRONG**: Copy/paste SQL from another tool
   - ❌ **WRONG**: Manually edit `_journal.json`
   - ✅ **RIGHT**: Update `schema.ts`, then run `pnpm drizzle:generate`

4. **Verify journal is updated:**

   - Check that `drizzle/migrations/meta/_journal.json` includes your new migration
   - Journal entry must have: `idx`, `version`, `when`, `tag`, `breakpoints`
   - Migration will be **silently skipped** if not in journal

5. **Why this matters:**
   - Drizzle's migration runner (`pnpm run drizzle:migrate`) only applies migrations listed in `_journal.json`
   - If you create a `.sql` file but forget to update `_journal.json`, the migration will **never run** in CI or production
   - This causes "column does not exist" errors and schema drift between environments

**Example of a properly registered migration:**

```json
{
  "idx": 13,
  "version": "7",
  "when": 1733400200000,
  "tag": "0013_social_link_state",
  "breakpoints": false
}
```

**If you discover an unregistered migration:**

1. DO NOT manually add it to `_journal.json` - this can cause migration order issues
2. Instead, regenerate the migration using `pnpm run drizzle:generate`
3. Or consult with team lead before manually editing the journal

### 5.1.1 Migration Validation (Pre-commit Hook)

A pre-commit hook automatically validates migration files to catch common issues:

**What it checks:**

1. Every `.sql` file in `drizzle/migrations/` has a corresponding entry in `_journal.json`
2. Journal entries have all required fields: `idx`, `version`, `when`, `tag`, `breakpoints`
3. Migration filenames match journal `tag` values
4. No gaps in migration `idx` sequence

**When it runs:**

- Automatically on `git commit`
- Before pushing to remote
- Can be bypassed with `--no-verify` flag (use sparingly!)

**If validation fails:**

```bash
❌ Migration validation failed:
   - Migration file 0015_my_feature.sql found but not in _journal.json
   - Use `pnpm drizzle-kit generate` to create migrations properly
```

**To fix:**

1. Remove the manually created `.sql` file
2. Run `pnpm drizzle-kit generate` to regenerate it properly
3. Commit again

### 5.1.2 Multiple Migrations Per PR (Migration Guard)

**Default policy: ONE migration per PR** to minimize merge conflicts and maintain clear change history.

**If you need multiple migrations in a single PR**, use one of these approaches:

#### Option 1: `schema:bulk` Label (Recommended)

Use when intentionally adding multiple related migrations:

```bash
# Check migration status
pnpm migration:multi-check

# Add label to your PR
pnpm migration:allow-multiple
# Or manually: gh pr edit <PR> --add-label "schema:bulk"
```

This label:

- ✅ Allows multiple migrations in the PR
- ✅ Still validates each migration individually
- ✅ Checks for CONCURRENTLY keyword
- ✅ Verifies migrations are registered in \_journal.json

#### Option 2: `skip-migration-guard` Label (Exceptional Cases Only)

Use ONLY when fixing broken migrations or schema consolidation:

```bash
# Bypass ALL migration checks (use with caution!)
pnpm migration:skip-guard
# Or manually: gh pr edit <PR> --add-label "skip-migration-guard"
```

**WARNING:** This completely bypasses migration validation. Only use for:

- Fixing migration errors (e.g., removing CONCURRENTLY)
- Cleaning up migration conflicts
- Emergency schema fixes approved by team

#### Option 3: Environment Variable (Local Testing)

```bash
SKIP_MIGRATION_GUARD=true pnpm migration:guard
```

**Quick reference:**

- Check status: `bash scripts/handle-multiple-migrations.sh`
- Allow multiple: `bash scripts/handle-multiple-migrations.sh --bulk`
- Skip all checks: `bash scripts/handle-multiple-migrations.sh --skip`

#### Squashing Migrations Before Merge (Advanced)

**When it's safe to squash:**
✅ On your feature branch **before** merging to main
✅ When you're the only one working on the branch
✅ To consolidate multiple local iterations into a single migration

**Workflow for squashing local migrations:**

```bash
# 1. You created multiple migrations during development
#    (All generated via pnpm drizzle:generate from schema changes)
drizzle/migrations/0009_add_column_a.sql
drizzle/migrations/0010_add_column_b.sql
drizzle/migrations/0011_add_column_c.sql

# 2. Reset to before first migration
git checkout HEAD~3 -- drizzle/migrations/
# This removes 0009, 0010, 0011 and restores journal state

# 3. Your schema in lib/db/schema.ts should already have all changes
#    (If not, consolidate all schema changes there now)

# 4. Generate a single consolidated migration via Drizzle
pnpm drizzle:generate
# Drizzle creates 0009_consolidated_changes.sql AND updates _journal.json
# ✅ CRITICAL: NEVER manually write SQL files - always use Drizzle

# 5. Verify the migration
cat drizzle/migrations/0009_*.sql
cat drizzle/migrations/meta/_journal.json

# 6. Commit and force push if already pushed to PR branch
git add -A
git commit -m "chore(db): consolidate migrations"
git push --force-with-lease
```

**CRITICAL: Always use Drizzle to generate migrations**

- ✅ CORRECT: `pnpm drizzle:generate` (Drizzle reads schema.ts, generates SQL + journal)
- ❌ WRONG: Manually creating `.sql` files
- ❌ WRONG: Manually editing `_journal.json`
- ❌ WRONG: Using raw SQL generators outside of Drizzle

**Why Drizzle generation is mandatory:**

1. Ensures `schema.ts` and migrations stay synchronized
2. Automatically updates journal with correct metadata
3. Generates type-safe, validated SQL
4. Creates snapshot files for change tracking
5. Prevents schema drift between code and database

**NEVER squash if:**
❌ Already merged to `main` branch
❌ Migration has run on any environment (ephemeral, production)
❌ Others are collaborating on your branch (communicate first)
❌ Referenced in production database migration history

**Alternative: Just use the label**
Instead of squashing, you can use `pnpm migration:allow-multiple` to allow multiple migrations in your PR. This is simpler and safer.

### 5.2 Index Creation in Drizzle Migrations (CRITICAL)

**NEVER use `CONCURRENTLY` in Drizzle migration files.** This is a common PostgreSQL mistake that will break your migrations.

**❌ WRONG - Will fail in Drizzle:**

```sql
-- ❌ FORBIDDEN - Cannot run inside transaction blocks
CREATE INDEX CONCURRENTLY idx_name ON table_name (column_name);
CREATE UNIQUE INDEX CONCURRENTLY uniq_name ON table_name (column_name);
```

**✅ RIGHT - Use standard CREATE INDEX:**

```sql
-- ✅ CORRECT - Works in Drizzle transaction blocks
CREATE INDEX IF NOT EXISTS idx_name ON table_name (column_name);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_name ON table_name (column_name);
```

**Why CONCURRENTLY fails:**

- Drizzle's `migrate()` function **wraps all migrations in transaction blocks** for atomicity
- PostgreSQL **explicitly forbids** `CREATE INDEX CONCURRENTLY` inside transactions
- Error: `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`
- This breaks E2E tests, CI/CD pipeline, and production deployments

**Production safety notes:**

- Always use `IF NOT EXISTS` to make index creation idempotent
- Test index creation time on ephemeral DB first (for large tables)
- For very large tables (>10M rows), consider:
  1. Creating index during low-traffic window
  2. Using partial indexes (`WHERE` clause) to reduce index size
  3. Monitoring database load during migration
- Drizzle migrations run quickly during deployment; indexes are created before traffic hits

**Migration validation:**

- Pre-commit hook automatically detects `CONCURRENTLY` in migrations
- CI will fail if CONCURRENTLY is present
- This prevents broken deployments before they reach production
- **📖 Reference**: See `docs/MIGRATION_CONCURRENTLY_RULE.md` for detailed explanation and historical context

### 5.3 PostgreSQL Syntax Requirements (CRITICAL)

**⚠️ IMPORTANT: These patterns are CRITICAL for migration idempotency. Non-idempotent migrations WILL cause production failures.**

When Drizzle generates migrations, it sometimes produces non-idempotent SQL. You **MUST** manually fix these patterns before committing:

#### 5.3.1 CREATE TYPE Idempotency (MOST COMMON ISSUE)

**❌ WRONG: `CREATE TYPE` without idempotency guard**

PostgreSQL does **NOT** support `CREATE TYPE IF NOT EXISTS`:

```sql
-- ❌ INVALID SYNTAX - PostgreSQL doesn't support IF NOT EXISTS for types
CREATE TYPE IF NOT EXISTS my_enum AS ENUM ('a', 'b', 'c');

-- ❌ WRONG - Not idempotent, will fail on re-run
CREATE TYPE my_enum AS ENUM ('a', 'b', 'c');
```

**What happens:** Migration fails with `type "my_enum" already exists` when run against database where type was created previously (CI tests, production recovery, etc.)

**✅ CORRECT: Use DO block with pg_type catalog check**

```sql
-- ✅ CORRECT - Idempotent pattern for CREATE TYPE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'my_enum') THEN
    CREATE TYPE my_enum AS ENUM ('a', 'b', 'c');
  END IF;
END $$;
```

**Why DO blocks are required:**
- PostgreSQL's `CREATE TYPE` statement doesn't support `IF NOT EXISTS` clause
- Must use procedural code (DO block) to check `pg_type` system catalog first
- This is the ONLY way to make type creation idempotent in PostgreSQL

**When to apply this pattern:**
- EVERY CREATE TYPE statement in EVERY migration
- Drizzle Kit does NOT generate this automatically - you must add it manually
- Pre-commit hooks will block migrations without this pattern (starting 2025-01-02)

#### 5.3.2 CREATE INDEX Idempotency

**❌ WRONG: CREATE INDEX without IF NOT EXISTS**

```sql
-- ❌ WRONG - Not idempotent
CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX uniq_users_clerk_id ON users(clerk_id);
```

**✅ CORRECT: Always use IF NOT EXISTS**

```sql
-- ✅ CORRECT - Idempotent index creation
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_clerk_id ON users(clerk_id);
```

**Why this matters:**
- Indexes can fail to create if they already exist
- Tests may run migrations multiple times
- Production recovery scenarios need idempotency

#### 5.3.3 ALTER TYPE ADD VALUE Idempotency

**❌ WRONG: ALTER TYPE without IF NOT EXISTS**

```sql
-- ❌ WRONG - Fails if value already exists
ALTER TYPE user_status ADD VALUE 'suspended';
```

**✅ CORRECT: Use IF NOT EXISTS clause**

```sql
-- ✅ CORRECT - Idempotent enum value addition
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'suspended';
```

**Note:** PostgreSQL 9.3+ supports IF NOT EXISTS for ALTER TYPE ADD VALUE.

#### 5.3.4 Migration Idempotency Checklist

Before committing ANY migration, verify:

- [ ] All `CREATE TYPE` statements wrapped in DO blocks with `pg_type` check
- [ ] All `CREATE INDEX` statements include `IF NOT EXISTS`
- [ ] All `ALTER TYPE ADD VALUE` statements include `IF NOT EXISTS`
- [ ] All `DROP` statements include `IF EXISTS`
- [ ] Migration can be run successfully twice without errors
- [ ] `pnpm run drizzle:check` passes locally

**Testing idempotency:**
```bash
# Run migration twice - both should succeed
pnpm run drizzle:migrate:preview
pnpm run drizzle:migrate:preview  # Should not fail
```

#### 5.3.5 Multiple statements in Neon MCP (Deprecated - use Drizzle)

The Neon MCP `run_sql` tool cannot execute multiple statements:

```sql
-- ❌ FAILS with "cannot insert multiple commands into a prepared statement"
CREATE INDEX idx_a ON table_a (col);
CREATE INDEX idx_b ON table_b (col);
```

#### ✅ RIGHT: One statement per call

```sql
-- ✅ CORRECT - execute each statement separately
CREATE INDEX idx_a ON table_a (col);
-- (separate call)
CREATE INDEX idx_b ON table_b (col);
```

#### Other PostgreSQL gotchas:

- **Enums are case-sensitive** - `'Active'` ≠ `'active'`
- **Use `timestamp` not `datetime`** - PostgreSQL uses `timestamp` or `timestamptz`
- **Use `text` not `varchar`** - In PostgreSQL, `text` is preferred over `varchar` for variable-length strings
- **Use `jsonb` not `json`** - `jsonb` is binary and supports indexing; `json` is text-based
- **Default values must match type** - `DEFAULT '{}'::jsonb` not `DEFAULT '{}'`

### 5.4 Migration Testing Checklist

Before merging any migration:

1. **Syntax validation:** Run `pnpm run drizzle:check` locally
2. **Fresh database test:** Apply migration to empty database
3. **Idempotency:** Use `IF NOT EXISTS` / `IF EXISTS` where supported
4. **Rollback plan:** Document how to reverse the migration if needed
5. **Seed compatibility:** Ensure `pnpm run drizzle:seed` still works after migration

## 5.5 CI/CD Workflow Details (Trunk-Based Deployment)

### Fast Path (Feature PRs → main)

- **Triggers:** PRs to `main` branch
- **Checks:** TypeScript typecheck + ESLint (~10-15s total)
- **Auto-merge:** Enabled for dependabot, codegen, PRs with `auto-merge` label
- **Timeline:** Feature → main in ~2 minutes (if auto-merge eligible)

### Full CI (Push to main)

- **Triggers:** Push to `main`
- **Checks:**
  - All fast checks (typecheck, lint)
  - Drizzle schema validation
  - Next.js build
  - Unit tests
  - E2E smoke tests
- **Database migrations:** Run automatically via `drizzle:migrate:prod` on deployment
- **Deployment:** Automatic to [jov.ie](https://jov.ie) after all checks pass
- **Post-deploy:** Canary health gate + production smoke tests
- **Timeline:** ~5 minutes from push to production

### Database Migrations

- **Auto-run:** Migrations run automatically on Vercel deploy via `drizzle:migrate:prod` script
- **Ephemeral Neon branches:** Auto-created per PR with unique name, auto-deleted on PR close
- **Long-lived branch:** Only `main` (trunk-based development)
- **Migration strategy:** Linear append-only (no squashing, no editing existing migrations)
- **Testing:** Each PR gets isolated ephemeral database for safe schema testing

### Environment URLs

- **Production:** [jov.ie](https://jov.ie) - Deployed from `main` branch
- **PR previews:** Unique Vercel preview URLs per PR (ephemeral)

### YC-Optimized Velocity

- **Ship multiple times per day:** Fast CI enables rapid iteration
- **Feature → production:** ~5 minutes (auto-merge + full CI + deploy)
- **Continuous deployment:** Every push to main goes to production

### Rollback Strategy

- **Code rollback:** `git revert` + push to main
- **Database rollback:** Create reverse migration (append-only, no destructive rollback)
- **Backups:** Neon point-in-time recovery available

### AI Code Reviews

- **CodeRabbit**: Automatic PR reviews on all pull requests. Configuration in `.coderabbit.yaml`. Provides comprehensive code review with path-specific instructions for high-risk areas.
- **Claude Code** (`@claude`): On-demand assistance via `.github/workflows/claude.yml`. Mention `@claude` in PR comments or issues for help.

#### Running the CodeRabbit CLI

CodeRabbit is already installed in the terminal. Run it as a way to review your code. Run the command: `cr -h` for details on commands available. In general, I want you to run CodeRabbit with the `--prompt-only` flag. To review uncommitted changes (this is what we'll use most of the time) run: `coderabbit review --prompt-only -t uncommitted` or `cr review --prompt-only -t uncommitted`.

**IMPORTANT:** When running CodeRabbit to review code changes, don't run it more than 3 times in a given set of changes.

**Slash Command:** Use `/coderabbit-review` to trigger an automated review and fix cycle that will:
1. Run CodeRabbit CLI with `--prompt-only` on uncommitted changes
2. Analyze all issues found
3. Fix each issue systematically
4. Re-run to verify fixes
5. Continue until clean (max 3 iterations)
6. Let it run as long as needed - do not stop until complete

## 6. Agent-Specific Notes

- **Claude (feature work, refactors)**

  - Own end-to-end changes: schema → backend → UI → tests.
  - Prefer server components and feature-flagged rollouts.
  - Always use Statsig for feature gates/experiments; do not introduce any other flag or analytics SDKs.

- **Codex (CI auto-fix, focused cleanups)**

  - Operates only via the `codex-autofix` workflow.
  - Keeps edits minimal and focused on fixing CI regressions.

- **Copilot / other LLM helpers**
  - Local assistance only; any branch/PR they help produce must still obey this guide.

## 7. Safety & Guardrails

- **No direct dependencies** on analytics/flags outside of the existing Statsig and analytics wrappers in `@/lib` and `@/lib/statsig`.
- **No direct Neon branch management** from agents; always go through CI workflows.
- **No direct pushes** to `main`.
- **HARD GUARDRAIL – Drizzle migrations are immutable:** Treat everything under `drizzle/migrations` as append-only. Do **not** edit, delete, reorder, squash, or regenerate existing migration files for any reason; only add new migrations. If a past migration appears incorrect, stop and escalate to a human instead of attempting an automated fix.
- New features ship **behind Statsig flags/experiments** and with **Statsig events** (or equivalent Statsig metrics) for primary actions.

## 8. Engineering Guardrails & Architecture

### 8.1 Component Architecture (Atomic)

- **One component per file.** Named export only; no default exports. Export name must match file name.
- **Atoms:** UI-only primitives (no business logic, no API calls), usually under `components/atoms/`.
- **Molecules:** Small combinations of atoms with minimal state, under `components/molecules/`.
- **Organisms:** Self-contained sections that can own state and feature logic, under `components/organisms/`.
- **Feature directories:** Use `components/<feature>/...` for domain-specific components that aren't widely reused.
- **Props:** Interface named `<ComponentName>Props`; children typed as `React.ReactNode`.
- **A11y & testing:** Add appropriate `aria-*` attributes; organisms must expose stable `data-testid` hooks.
- **forwardRef:** Use `React.forwardRef` for DOM atoms/molecules and set `Component.displayName`.
- **Deprecation:** Mark old components with `/** @deprecated Reason */` and point to the replacement.

### 8.2 Design Aesthetic & Copy

- **Brand:** Color-agnostic; Jovie logo is black or white only.
- **Surfaces:**
  - Dark mode: black background, white text/buttons; primary CTAs are solid black with white text.
  - Light mode: white background, black text/buttons; primary CTAs are solid white with black text.
  - Marketing sections may use accent colors, but core system components stay neutral.
- **Copywriting:**
  - Use "Jovie profile" and "Jovie handle/username".
  - Never describe Jovie itself as a "link-in-bio" product (only use that phrase when comparing competitors).
  - Apple-level clarity; concise, active voice; focus copy on activation and MRR.

### 8.3 Stack & Packages

- **Runtime & framework:** Next.js App Router + React Server Components.
- **Package manager:** `pnpm` only.
- **DB:** Neon + Drizzle (`@neondatabase/serverless`, `drizzle-orm/neon-serverless` with WebSocket support for transactions).
- **Auth:** Clerk via `@clerk/nextjs` / `@clerk/nextjs/server`.
- **Styling:** Tailwind CSS v4 + small helpers (e.g., `clsx`, `tailwind-merge`) where needed.
- **Headless UI:** Prefer `@headlessui/react` and `@floating-ui/*` for dialogs, menus, sheets, tooltips, and popovers.
- **Billing:** Stripe (`stripe` on server, `@stripe/stripe-js` on client); no Clerk Billing.
- **Analytics & flags:** Statsig-only for product analytics and feature flags; do not add PostHog/Segment/RudderStack.
- **Icons:** Use **Lucide React only** (`lucide-react`). Do not use Heroicons, Simple Icons (except for brand logos via `SocialIcon`), or other icon libraries. Import icons directly (e.g., `import { Check, X } from 'lucide-react'`) and use the `<Icon name="..." />` wrapper component for dynamic icon names.

### 8.4 Tailwind & Layout

- `tailwind.config.js`, `postcss.config.mjs`, and the top of `styles/globals.css` are effectively locked.
- Do **not** rename/move `tailwind.config.js`, add `@config`/`@source` directives, or switch to TS configs.
- Add custom utilities via `@utility` in `globals.css`; add new content paths via the `content` array in `tailwind.config.js`.
- Ensure `globals.css` starts with `@import "tailwindcss";` and theme imports as documented.

## 9. Runtime, Auth, Database & RLS

### 9.1 Runtime Modes (Vercel)

- Use **Edge runtime** (`export const runtime = 'edge'`) for latency-sensitive public reads (e.g., public profiles).
- Use **Node runtime** (`export const runtime = 'nodejs'`) for Stripe, Node-only libraries, and heavy compute.
- Never import Node-only libraries (e.g., `stripe`, Node crypto) into Edge code.

### 9.2 Auth (Clerk)

- Use `clerkMiddleware()` in `middleware.ts` to protect private routes.
- Wrap the app with `<ClerkProvider>` in `app/layout.tsx`.
- Import server helpers (e.g., `auth`) from `@clerk/nextjs/server` and client hooks/components from `@clerk/nextjs`.
- Ensure Clerk environment and allowed frontend URLs are configured for preview and production domains.

#### 9.2.1 Auth + Onboarding Flow (Current Baseline)

- **Authentication model:**
  - **Email-only OTP** using Clerk Elements; **no passwords** and **no OAuth/social providers** in the UI.
  - Sign-in and sign-up live under the App Router:
    - `GET /signin` → `OtpSignInForm` (Clerk Elements + shadcn UI) inside `AuthLayout`.
    - `GET /signup` → `OtpSignUpForm` (Clerk Elements + shadcn UI) inside `AuthLayout`.
- **Onboarding integration:**
  - New users are taken through `/onboarding` immediately after sign-up (configure Clerk **after sign-up redirect** to `/onboarding` in the Dashboard).
  - `/onboarding` is a **protected route** that:
    - Requires a valid Clerk session (`auth()`), otherwise redirects to `/signin?redirect_url=/onboarding`.
    - Uses the same `AuthLayout` shell as `/signin` and `/signup` for a unified experience.
    - Renders the Apple-style multi-step onboarding organism (name → handle → done) backed by `completeOnboarding` server actions.
- **Onboarding steps (streamlined):**
  1. **Name** – collect the artist display name.
  2. **Handle** – pick and validate the Jovie handle (with availability checks and profile URL preview).
  3. **Done** – confirm the public profile URL and offer CTAs (go to Dashboard, copy link).
- **Testing expectations:**
  - E2E tests should authenticate via **Clerk test-mode tokens / programmatic sessions**, not password-based flows.
  - Do **not** reintroduce password fields or OAuth buttons in new auth or onboarding UI.

### 9.3 Database (Neon + Drizzle)

- Use the transaction-capable client: `@neondatabase/serverless` + `drizzle-orm/neon-serverless`.
- WebSocket support is configured via `neonConfig.webSocketConstructor = ws` for full transaction capabilities.
- The database client uses connection pooling (`Pool`) for production-ready performance.
- Transaction support enables proper RLS with `SET LOCAL` session variables that persist within transaction scope.
- Run Drizzle migrations only in Node (never from Edge code).
- Keep Neon branches tidy: main branch for production + ephemeral branches per PR created/destroyed via CI.
- Set `app.clerk_user_id` per request on the server before DB calls when RLS policies depend on it (use `withDbSession` or `withDbSessionTx` helpers).

### 9.4 Postgres RLS Pattern

- Use `current_setting('app.user_id', true)` in RLS policies to authorize access.
- Do not hardcode user IDs in policies; always drive them through the session variable.

## 10. Performance, Caching & Public Profiles

- Public profile reads:
  - Edge runtime + direct Neon queries (no cache layer yet).
  - Use RSC streaming/Suspense to minimize client-side JS.
- Caching & rate limiting:
  - Currently disabled by design ("do things that dont scale").
  - Only introduce Redis/rate limiting when traffic/abuse/latency thresholds are clearly hit.

## 11. Payments (Stripe)

- Stripe is Node-only; do not import `stripe` in Edge handlers or React Server Components.
- Use dedicated Node routes for:
  - Checkout (`/app/api/stripe/checkout/route.ts`).
  - Customer portal (`/app/api/stripe/portal/route.ts`).
  - Webhooks (`/app/api/stripe/webhook/route.ts`) with **raw body** access.
- Store `stripe_customer_id` keyed by Clerk `userId` in the database.

## 12. Testing Strategy

- Follow a **pyramid**:
  - Unit tests (fast, many) > integration tests (fewer) > E2E (critical paths only).
- Unit tests:
  - Focus on pure logic and utilities; run quickly (<200ms each).
  - Mock external services (Clerk, Stripe, Statsig, DB).
- Integration tests:
  - Cover API routes and DB interactions with a test database.
- E2E tests:
  - Exercise golden paths such as sign-up  create profile  share profile, and monetization flows.
- CI expectations:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test` must be green before merge.
  - Smoke E2E tests run on PRs touching critical flows.

## 13. CI/CD, Critical Modules & Landmines

- **CI/CD:**
  - Fast checks always run: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
  - Full CI (build, Drizzle checks, E2E) runs for higher-risk changes or when labeled (`full-ci`).
- **Critical module protection:**
  - Protected areas: marketing homepage, Featured Creators, and money-path flows (checkout/portal/pricing/onboarding).
  - Do not introduce mocks/static lists in protected modules; keep using adapters and real data sources.
  - Preserve existing `data-testid` hooks so homepage/money-path smoke tests remain stable.
- **Landmines to avoid:**
  - Edge/Node leakage (Node-only libs in Edge).
  - Clerk host/environment mismatches.
  - Running migrations from Edge.
  - Tailwind v4 plugin/config drift.
  - Env/secret sprawl or mixing preview and production credentials.

## 14. Next.js 16 Best Practices

- Enable Cache Components with the `use cache` directive so caching is explicit and the compiler can generate consistent cache keys.
- Default to request-time execution for dynamic server code unless Cache Components explicitly wrap it, matching the new “opt-in cache” mindset.
- Combine Cache Components with Suspense-based Partial Prerendering to deliver static shells with targeted dynamic updates.
- Pass a cacheLife profile (we recommend `'max'`) as the second argument to `revalidateTag()` to get SWR-style behavior instead of manually tracking expirations.
- Call `updateTag()` inside Server Actions when mutations must show read-your-write data immediately within the same request.
- Use the Server Actions-only `refresh()` when you need to refresh uncached data without touching cached page shells, complementing `router.refresh`.
- Plug into Next.js DevTools MCP so agents and teammates can inspect routing, caching, and the unified log surface for faster debugging.
- Replace `middleware.ts` with `proxy.ts`/`proxy` (Node runtime) handlers to keep the network boundary clear; keep Edge middleware only for legacy cases.
- Monitor the enhanced dev/build logs that break out compile work vs. React rendering so you can spot time sinks faster.
- Default to the stable Turbopack bundler in both dev and prod for the 2–5× faster builds and up to 10× speedier Fast Refresh, falling back to webpack only when absolutely necessary.
- Turn on Turbopack filesystem caching so repeated restarts reuse artifacts and large repositories feel snappier.
- Start new features from the refreshed `create-next-app` template (App Router, TypeScript-first, Tailwind, ESLint) to stay aligned with current defaults.
- Use the Build Adapters API when you need to hook into the build flow for custom deployment hosts or infrastructure automation.
- Gradually opt into `reactCompiler` once you’ve measured the build-time cost; it automatically memoizes components to cut redundant renders.
- Lean on layout deduplication and incremental prefetching (built into Next.js 16) so shared layouts download once and cached chunks only refresh when invalidated.
- Take advantage of React 19.2 additions (`View Transitions`, `useEffectEvent`, `<Activity />`) whenever you build new transitions or interaction patterns.

## 15. Sentry Instrumentation & Logging

- Always import Sentry via `import * as Sentry from '@sentry/nextjs'` and initialize once per context (client: `instrumentation-client.(js|ts)`, server: `sentry.server.config.ts`, edge: `sentry.edge.config.ts`).
- Keep the default `Sentry.init` configuration (DSN + `enableLogs: true`) unless a teammate documents a safe override; reuse the provided logger (e.g., `const { logger } = Sentry`) rather than wiring new instances.
- Use `Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] })` when enabling console forwarding so you don’t need to wrap every console call manually.
- Capture unexpected exceptions with `Sentry.captureException(error)` inside `catch` blocks or fail-fast paths where errors should be surfaced.
- Create spans for key UI/API actions (`button clicks`, `fetch calls`, `critical business logic`) using `Sentry.startSpan` with meaningful `op` and `name` values, and attach attributes/metrics describing inputs or request-specific data.
  ```javascript
  Sentry.startSpan({ op: "ui.click", name: "Test Button Click" }, (span) => {
    span.setAttribute("config", value);
    span.setAttribute("metric", metric);
    doSomething();
  });
  ```
- Wrap API requests similarly so the span describes the route and HTTP operation when calling fetchers.
  ```javascript
  return Sentry.startSpan(
    { op: "http.client", name: `GET /api/users/${userId}` },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      return response.json();
    }
  );
  ```
- Use the shared `logger` helpers for structured logging and prefer `logger.fmt` when injecting variables; e.g., `logger.debug(logger.fmt`Cache miss for user: ${userId}`)` or `logger.error('Failed to process payment', { orderId, amount })`.

## 16. Auto-Commit at End of Job (REQUIRED)

All AI agents **MUST** commit their work at the end of every job/task. This ensures no work is lost and maintains a clean audit trail.

**CRITICAL: Commit messages MUST follow the Conventional Commits format** (enforced by commitlint via husky). Invalid commit messages will be rejected.

### Rules

1. **Always commit before ending a session:**

   - After completing a task, stage and commit all changes.
   - Use conventional commit format: `type: subject` or `type(scope): subject`.
   - Keep commit messages concise but descriptive.

2. **Commit command sequence:**

   ```bash
   git add -A
   git commit -m "type: subject"
   ```

3. **When to commit:**

   - At the end of every completed task.
   - Before switching to a different task.
   - Before ending a conversation/session.
   - After any significant milestone within a larger task.

4. **Commit message format (Conventional Commits):**

   - **Format:** `type(scope): subject`
     - `type` is required (lowercase, no brackets)
     - `scope` is optional (lowercase, in parentheses)
     - `subject` is required (lowercase, imperative mood, no period)
   - **Types:**
     - `feat:` for new features or enhancements
     - `fix:` for bug fixes
     - `chore:` for maintenance, refactors, docs, or config changes
     - `refactor:` for code refactoring without feature changes or bug fixes
     - `docs:` for documentation changes
     - `style:` for formatting, missing semicolons, etc. (no code change)
     - `test:` for adding or updating tests
     - `perf:` for performance improvements
   - **Subject rules:**
     - Use lowercase (except for proper nouns)
     - Use imperative mood ("add" not "added" or "adds")
     - No period at the end
     - Keep it under 72 characters when possible
   - **Body rules (if including a body):**
     - Each line must not exceed 100 characters (enforced by commitlint)
     - Wrap long lines to stay within the limit
     - Use blank line to separate body from subject
   - **Examples:**

     - ✅ `feat: add skeleton loaders for auth screens`
     - ✅ `fix(auth): resolve login redirect issue`
     - ✅ `chore: update cursor rules for commit messages`
     - ✅ `feat(dashboard): add user avatar component (#123)`
     - ✅ Commit with body (lines ≤ 100 chars):

       ```
       chore: update agent guidelines and commit message format

       - Clarify AI agent restrictions on merging PRs to production
       - Update commit message format to follow Conventional Commits
       - Enhance documentation on feature flag creation
       ```

     - ❌ `[feat]: add skeleton loaders` (brackets not allowed)
     - ❌ `feat: Added skeleton loaders` (not imperative)
     - ❌ `feat: Add skeleton loaders.` (period not allowed)
     - ❌ Body line too long:
       ```
       - Clarify AI agent restrictions on merging PRs to production and modifying repository settings.
       ```
       (exceeds 100 characters)

5. **Do NOT commit if:**

   - The code is in a broken state (fails typecheck/lint).
   - You are explicitly told not to commit.
   - The changes are exploratory/experimental and the user hasn't approved them.

6. **Push policy:**
   - Commit locally at minimum.
   - Push to remote only if on a feature branch (never push directly to `main`).
   - Ask before pushing if uncertain about branch state.

### Example End-of-Job Flow

```bash
# 1. Verify changes are valid
pnpm typecheck && pnpm lint

# 2. Stage all changes
git add -A

# 3. Commit with conventional message (will be validated by commitlint)
# Simple commit (subject only):
git commit -m "feat: add skeleton loaders for auth screens"

# Or with body (wrap body lines to ≤ 100 characters):
git commit -m "chore: update agent guidelines

- Clarify AI agent restrictions on merging PRs
- Update commit message format to follow Conventional Commits
- Enhance documentation on feature flag creation"

# 4. (Optional) Push if on feature branch
git push origin feat/auth-skeleton-loaders
```

**Failure to commit at end of job is a violation of agent protocol.**
**Commit messages that don't follow Conventional Commits format will be rejected by husky/commitlint.**

## 17. Tech Debt Tracking (REQUIRED)

AI agents **must** maintain the tech debt tracker at `TECH_DEBT_TRACKER.md` in the repo root.

### When to Update the Tracker

**You MUST update `TECH_DEBT_TRACKER.md` when:**

1. **Fixing tech debt:** Move items from "Open Issues" to "Resolved Issues"
2. **Discovering new tech debt:** Add items to the appropriate "Open Issues" section
3. **Completing refactoring tasks:** Update the metrics dashboard

### How to Update

**When resolving an issue:**

```markdown
## Resolved Issues

### YYYY-MM-DD

| Item | Priority | Resolution | Reference |
|------|----------|------------|-----------|
| Description of what was fixed | P0/P1/P2/P3 | Brief explanation | PR or commit ref |
```

**When discovering new tech debt:**

```markdown
### P1 - High (or appropriate priority)

| File | Line(s) | Description |
|------|---------|-------------|
| path/to/file.ts | 42 | What the issue is |
```

### Priority Definitions

- **P0 (Critical):** Blocks production, security vulnerabilities, data loss risks
- **P1 (High):** Significant code quality issues, type safety problems
- **P2 (Medium):** Deprecated code, TODO comments, minor improvements
- **P3 (Low):** Nice-to-have cleanup, test organization

### What Constitutes Tech Debt

Track these items in `TECH_DEBT_TRACKER.md`:

- `@ts-nocheck` or `@ts-ignore` without clear justification
- Empty catch blocks
- `console.*` statements in production code (use Sentry instead)
- Files marked `@deprecated` without migration path
- TODO/FIXME/HACK comments
- TypeScript `any` types in production code
- eslint-disable without justification
- Large files (>500 lines) that should be split
- Duplicated code patterns

### Metrics to Track

Update the metrics dashboard when counts change:

```markdown
| Metric | Count | Target | Last Updated |
|--------|-------|--------|--------------|
| `@ts-nocheck` files | X | 0 | YYYY-MM-DD |
| `@ts-ignore` in production | X | <5 | YYYY-MM-DD |
| Deprecated files | X | 0 | YYYY-MM-DD |
| TODO comments | X | 0 | YYYY-MM-DD |
| Empty catch blocks | X | 0 | YYYY-MM-DD |
```

**Failure to update the tech debt tracker when addressing or discovering tech debt is a violation of agent protocol.**
