-- Add tip-related pixel event types for retargeting
ALTER TYPE "pixel_event_type" ADD VALUE IF NOT EXISTS 'tip_page_view';
ALTER TYPE "pixel_event_type" ADD VALUE IF NOT EXISTS 'tip_intent';
