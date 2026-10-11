-- Founder decision 2026-10-03: silently admit the eight external accounts
-- stranded in waitlist_pending (seven never got a waitlist entry, one was
-- waitlisted with auto-accept off). No email or outbound is sent: this only
-- moves them past the gate so their next visit can claim a profile.
-- Idempotent: rows already past waitlist_pending are untouched.
UPDATE "users"
SET "user_status" = 'waitlist_approved', "updated_at" = now()
WHERE "user_status" = 'waitlist_pending'
  AND "deleted_at" IS NULL
  AND "id" IN (
    '474e7a90-9692-44f7-9a59-1b0a29f87996',
    'f3957d41-1596-4c22-919b-6530fd90894d',
    'b1ac1315-4f4a-4fd0-9f91-e2aa3ae1ee0f',
    '648170b4-5a85-4fbb-acbf-9eb128174075',
    '1ab36aa8-3a0b-4cbd-8ad1-5ef2d470defb',
    '53a6a494-6738-4ea3-9625-6b058b493aa3',
    '1ebb4b34-4c3a-4711-bc8b-5d11f1d39881',
    '4595f57a-2116-41c2-b638-1edbc33990bb'
  );
--> statement-breakpoint
UPDATE "waitlist_entries"
SET "status" = 'approved', "approved_at" = now(), "updated_at" = now()
WHERE "id" = '93e09a32-9b69-48ab-a96a-4ab631eb7790'
  AND "status" = 'waitlisted';
