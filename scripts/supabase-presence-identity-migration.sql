-- Presence identity migration - deduplicate users when nickname changes
-- Run this in Supabase SQL Editor after supabase-presence-migration.sql
--
-- Adds identity column so the same user (ims_sub) always maps to one row per page,
-- even when display name (user_id) changes (e.g. after setting a nickname).

-- Add identity column (stable key per user per page)
ALTER TABLE presence ADD COLUMN IF NOT EXISTS identity VARCHAR(512);

-- Backfill existing rows: identity = 'legacy:' || id (preserves one row per legacy record)
UPDATE presence SET identity = 'legacy:' || id::text WHERE identity IS NULL;

-- Enforce NOT NULL so (page_id, identity) unique works correctly
ALTER TABLE presence ALTER COLUMN identity SET NOT NULL;

-- Drop old unique constraint
ALTER TABLE presence DROP CONSTRAINT IF EXISTS presence_page_id_user_id_key;

-- Add new unique constraint on (page_id, identity)
ALTER TABLE presence ADD CONSTRAINT presence_page_id_identity_key UNIQUE (page_id, identity);
