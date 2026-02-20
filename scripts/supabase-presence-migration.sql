-- Presence panel - Supabase schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- https://app.supabase.com
--
-- After running:
-- 1. Add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to .env and App Builder secrets
-- 2. Add supabaseUrl and supabaseAnonKey to src/universal-editor-ui-1/web-src/src/config.json

-- Presence table (compatible with existing schema)
CREATE TABLE IF NOT EXISTS presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id VARCHAR(512) NOT NULL,
  user_id VARCHAR(256) NOT NULL,
  editable_id VARCHAR(256),
  color VARCHAR(7) NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_page ON presence(page_id);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);

-- Enable Realtime (add to supabase_realtime publication)
-- If this fails with "already member of publication", the table is already configured.
ALTER PUBLICATION supabase_realtime ADD TABLE presence;

-- RLS: allow anon to read (client subscribes with anon key; filter by page_id in subscription)
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read presence" ON presence;
CREATE POLICY "Allow read presence" ON presence FOR SELECT TO anon USING (true);
-- Service role (used by actions) bypasses RLS for writes
