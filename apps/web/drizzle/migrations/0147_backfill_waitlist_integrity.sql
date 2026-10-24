-- JOV-5831: legacy ingestion and gate bypasses left both pending and approved
-- users without an entry. Migration 0134 only covered pending users. Preserve
-- existing admission decisions, links and intake data; send no communications.
INSERT INTO "waitlist_entries" (
  "email", "email_normalized", "email_hash", "source", "canonical",
  "status", "status_reason", "waitlisted_at", "approved_at"
)
SELECT DISTINCT ON (lower(trim(u."email")))
  lower(trim(u."email")),
  lower(trim(u."email")),
  encode(sha256(convert_to(lower(trim(u."email")), 'UTF8')), 'hex'),
  'signup', true,
  CASE WHEN u."user_status" = 'waitlist_approved'
    THEN 'approved'::waitlist_status ELSE 'waitlisted'::waitlist_status END,
  CASE WHEN u."user_status" = 'waitlist_approved'
    THEN 'legacy_user_approved' ELSE 'signup_pending_review' END,
  CASE WHEN u."user_status" = 'waitlist_pending' THEN now() END,
  CASE WHEN u."user_status" = 'waitlist_approved' THEN now() END
FROM "users" u
WHERE u."user_status" IN ('waitlist_pending', 'waitlist_approved')
  AND u."deleted_at" IS NULL
  AND nullif(trim(u."email"), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "waitlist_entries" w
    WHERE w."id" = u."waitlist_entry_id"
      OR (w."canonical" = true AND (
        w."email_normalized" = lower(trim(u."email"))
        OR lower(trim(w."email")) = lower(trim(u."email"))
      ))
  )
-- Case variants can belong to multiple legacy users. Retain an existing
-- approval rather than letting an arbitrary pending row win the shared entry.
ORDER BY lower(trim(u."email")), (u."user_status" = 'waitlist_approved') DESC, u."id"
ON CONFLICT DO NOTHING;
