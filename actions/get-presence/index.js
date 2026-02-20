/*
 * <license header>
 */

const { getSupabase } = require('../lib/db');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function main(params) {
  const { page_id } = params;
  if (!page_id) {
    return { statusCode: 400, headers: HEADERS, body: { error: 'page_id required' } };
  }
  try {
    const supabase = getSupabase(params);

    // Delete stale rows (older than 2 minutes)
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabase.from('presence').delete().lt('last_seen', cutoff);

    const { data: rows, error } = await supabase
      .from('presence')
      .select('user_id, editable_id, color, last_seen')
      .eq('page_id', page_id)
      .order('last_seen', { ascending: false });

    if (error) throw error;

    const items = (rows || []).map((r) => ({
      user_id: r.user_id,
      editable_id: r.editable_id,
      color: r.color,
      last_seen: r.last_seen,
    }));

    return { statusCode: 200, headers: HEADERS, body: { items } };
  } catch (err) {
    console.error('[get-presence] error', err);
    return { statusCode: 500, headers: HEADERS, body: { error: err.message } };
  }
}

module.exports = { main };
