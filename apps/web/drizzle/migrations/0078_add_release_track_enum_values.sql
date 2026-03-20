-- Migration: Add 'release_track' enum values
-- Must run in its own transaction before being used in CHECK constraints.
-- PostgreSQL requires enum values to be committed before they can be referenced.

ALTER TYPE "provider_link_owner_type" ADD VALUE IF NOT EXISTS 'release_track';
ALTER TYPE "content_slug_type" ADD VALUE IF NOT EXISTS 'release_track';
