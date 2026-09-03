#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "$script_dir/.." && pwd)"
cd "$web_dir"

if [[ "${RUN_INVESTOR_UPDATE_DB_INTEGRATION:-}" != "1" ]]; then
  echo "SKIP: set RUN_INVESTOR_UPDATE_DB_INTEGRATION=1 to run the isolated PostgreSQL ledger test."
  exit 0
fi

database_name="jovie_inv_update_test_${$}_${RANDOM}"
artifact_dir="$(mktemp -d)"

cleanup() {
  dropdb --if-exists --force "$database_name" >/dev/null 2>&1 || true
  rm -f "$artifact_dir/concurrent-decision.log"
  rmdir "$artifact_dir" 2>/dev/null || true
}
trap cleanup EXIT

createdb --template=template0 "$database_name"
psql -X -v ON_ERROR_STOP=1 "$database_name" <<'SQL'
CREATE TABLE public.memory_source_records (
  id uuid PRIMARY KEY
);
SQL
psql -X -v ON_ERROR_STOP=1 "$database_name" \
  -f drizzle/migrations/0098_hesitant_demogoblin.sql >/dev/null

# Ratchet against the current tree: apply every later migration that can touch
# this boundary, so a future trigger/constraint change cannot pass by replaying
# only the original schema.
while IFS= read -r migration; do
  migration_name="$(basename "$migration")"
  [[ "$migration_name" > "0098_hesitant_demogoblin.sql" ]] || continue
  if grep -q -E 'investor_update_|investor_stakeholder_records' "$migration"; then
    psql -X -v ON_ERROR_STOP=1 "$database_name" -f "$migration" >/dev/null
  fi
done < <(find drizzle/migrations -maxdepth 1 -type f -name '*.sql' | sort)

psql -X -v ON_ERROR_STOP=1 "$database_name" <<'SQL'
INSERT INTO memory_source_records (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

INSERT INTO investor_update_drafts (
  id, period_start, subject, created_by_user_id
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '2026-08-01',
  'August update',
  'founder'
);

INSERT INTO investor_update_candidates (
  id, draft_id, kind, category, metric_label, metric_value, metric_unit,
  window_start, window_end, source_record_id, source_label,
  source_observed_at, confidence, caveats, proposed_claim, relevance_score
) VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'win', 'growth', 'Qualified creators', '12', 'count',
    '2026-08-01T00:00:00Z', '2026-08-29T00:00:00Z',
    '10000000-0000-4000-8000-000000000001', 'source one',
    '2026-08-29T01:00:00Z', 0.9, '[]'::jsonb,
    'Qualified creator growth improved.', 0.9
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'ask', 'fundraising', 'Introductions requested', '2', 'count',
    '2026-08-01T00:00:00Z', '2026-08-29T00:00:00Z',
    '10000000-0000-4000-8000-000000000002', 'source two',
    '2026-08-29T01:00:00Z', 0.8, '[]'::jsonb,
    'Please introduce two creator-economy operators.', 0.8
  );

INSERT INTO investor_update_candidate_decisions (
  id, candidate_id, decision, edited_claim, decided_by_user_id
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'share', null, 'founder'
);
SQL

if psql -X -v ON_ERROR_STOP=1 "$database_name" >/dev/null 2>&1 <<'SQL'
INSERT INTO investor_update_final_approvals (
  draft_id, rendered_copy, copy_hash, snapshot_fingerprint, draft_revision,
  decision_record_ids, recipient_segments, recipient_count, tracking_settings,
  approved_by_user_id, expires_at
) VALUES (
  '20000000-0000-4000-8000-000000000001', 'pending', 'hash', 'fingerprint', 3,
  '["40000000-0000-4000-8000-000000000001"]'::jsonb,
  '[]'::jsonb, 1,
  '{"opens":false,"clicks":false}'::jsonb,
  'founder', now() + interval '15 minutes'
);
SQL
then
  echo "FAIL: approval accepted a draft with an undecided candidate." >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 "$database_name" <<'SQL'
INSERT INTO investor_update_candidate_decisions (
  id, candidate_id, decision, edited_claim, decided_by_user_id
) VALUES (
  '40000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002',
  'exclude', null, 'founder'
);

INSERT INTO investor_update_final_approvals (
  id, draft_id, rendered_copy, copy_hash, snapshot_fingerprint, draft_revision,
  decision_record_ids, recipient_segments, recipient_count, tracking_settings,
  approved_by_user_id, expires_at
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'approved', 'hash', 'fingerprint', 4,
  '["40000000-0000-4000-8000-000000000001","40000000-0000-4000-8000-000000000002"]'::jsonb,
  '[]'::jsonb, 1,
  '{"opens":false,"clicks":false}'::jsonb,
  'founder', now() + interval '15 minutes'
);
SQL

if psql -X -v ON_ERROR_STOP=1 "$database_name" \
  -c "UPDATE investor_update_candidate_decisions SET decision = 'exclude' WHERE id = '40000000-0000-4000-8000-000000000001'" \
  >/dev/null 2>&1; then
  echo "FAIL: append-only decision mutation was accepted." >&2
  exit 1
fi

if psql -X -v ON_ERROR_STOP=1 "$database_name" \
  -c "DELETE FROM investor_update_final_approvals WHERE id = '50000000-0000-4000-8000-000000000001'" \
  >/dev/null 2>&1; then
  echo "FAIL: append-only approval deletion was accepted." >&2
  exit 1
fi

PGAPPNAME=investor_update_concurrent_decision \
  psql -X -v ON_ERROR_STOP=1 "$database_name" >"$artifact_dir/concurrent-decision.log" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO investor_update_candidate_decisions (
  id, candidate_id, decision, edited_claim, decided_by_user_id
) VALUES (
  '40000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000001',
  'edit', 'A concurrent edit.', 'founder'
);
SELECT pg_advisory_xact_lock(8675309);
SELECT pg_sleep(3);
COMMIT;
SQL
concurrent_pid=$!

concurrent_ready=false
for _attempt in {1..100}; do
  lock_count="$(psql -X -Atq "$database_name" -c "
    SELECT count(*)
    FROM pg_locks lock
    JOIN pg_stat_activity activity ON activity.pid = lock.pid
    WHERE lock.locktype = 'advisory'
      AND lock.granted
      AND activity.application_name = 'investor_update_concurrent_decision'
  ")"
  if [[ "$lock_count" == "1" ]]; then
    concurrent_ready=true
    break
  fi
  sleep 0.05
done
if [[ "$concurrent_ready" != "true" ]]; then
  echo "FAIL: competing decision session never reached its deterministic lock point." >&2
  wait "$concurrent_pid" || true
  exit 1
fi

if psql -X -v ON_ERROR_STOP=1 "$database_name" >/dev/null 2>&1 <<'SQL'
INSERT INTO investor_update_final_approvals (
  draft_id, rendered_copy, copy_hash, snapshot_fingerprint, draft_revision,
  decision_record_ids, recipient_segments, recipient_count, tracking_settings,
  approved_by_user_id, expires_at
) VALUES (
  '20000000-0000-4000-8000-000000000001', 'raced', 'hash', 'fingerprint', 4,
  '["40000000-0000-4000-8000-000000000001","40000000-0000-4000-8000-000000000002"]'::jsonb,
  '[]'::jsonb, 1,
  '{"opens":false,"clicks":false}'::jsonb,
  'founder', now() + interval '15 minutes'
);
SQL
then
  echo "FAIL: approval accepted a revision changed by a competing session." >&2
  wait "$concurrent_pid" || true
  exit 1
fi
wait "$concurrent_pid"

revision="$(psql -X -Atq "$database_name" -c "SELECT revision FROM investor_update_drafts WHERE id = '20000000-0000-4000-8000-000000000001'")"
if [[ "$revision" != "5" ]]; then
  echo "FAIL: expected competing decision to advance revision to 5, got $revision." >&2
  exit 1
fi

echo "PASS: PostgreSQL rejected pending approval, ledger mutation, and concurrent stale approval."
