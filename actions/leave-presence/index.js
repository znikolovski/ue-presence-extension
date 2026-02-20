/*
 * <license header>
 */

const { getSupabase } = require('../lib/db');
const { resolveImsSubFromToken } = require('../lib/ims-userinfo');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function main(params) {
  const { page_id, user_id, token } = params;
  if (!page_id) {
    return { statusCode: 400, headers: HEADERS, body: { error: 'page_id required' } };
  }

  let identity = null;
  if (token) {
    const ims_sub = await resolveImsSubFromToken(token);
    if (ims_sub) identity = ims_sub;
  }
  if (!identity && user_id) identity = `anon:${user_id}`;
  if (!identity) {
    return { statusCode: 400, headers: HEADERS, body: { error: 'user_id or token required' } };
  }

  try {
    const supabase = getSupabase(params);
    const { error } = await supabase
      .from('presence')
      .delete()
      .eq('page_id', page_id)
      .eq('identity', identity);

    if (error) throw error;
    return { statusCode: 200, headers: HEADERS, body: { ok: true } };
  } catch (err) {
    console.error('[leave-presence] error', err);
    return { statusCode: 500, headers: HEADERS, body: { error: err.message } };
  }
}

module.exports = { main };
