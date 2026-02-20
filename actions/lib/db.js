/*
 * <license header>
 */

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase(params) {
  const url = params.SUPABASE_URL;
  const key = params.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (!supabase) supabase = createClient(url, key);
  return supabase;
}

const COLOR_PALETTE = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
  '#3949AB', '#1E88E5', '#00ACC1', '#00897B',
  '#43A047', '#7CB342', '#C0CA33', '#FDD835'
];

function assignColor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

module.exports = { getSupabase, assignColor, COLOR_PALETTE };
