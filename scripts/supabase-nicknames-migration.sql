-- User nicknames - Supabase schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- https://app.supabase.com
--
-- Links IMS sub (OIDC subject) to a user-configurable nickname used in presence.

CREATE TABLE IF NOT EXISTS user_nicknames (
  ims_sub VARCHAR(256) PRIMARY KEY,
  nickname VARCHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: service-role actions bypass RLS; ims_sub is always derived from token server-side
ALTER TABLE user_nicknames ENABLE ROW LEVEL SECURITY;
