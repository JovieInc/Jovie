-- Apply once only to an existing items table whose PRAGMA table_info(items)
-- has no excerpt column. Fresh databases use schema.sql and skip this file.
ALTER TABLE items ADD COLUMN excerpt TEXT;
