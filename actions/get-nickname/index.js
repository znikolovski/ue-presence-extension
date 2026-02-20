/*
 * <license header>
 */

const { getSupabase } = require('../lib/db');
const { resolveImsSubFromToken } = require('../lib/ims-userinfo');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function main(params) {
  const { token } = params;
  if (!token) {
    return { statusCode: 401, headers: HEADERS, body: { error: 'token required' } };
  }

  try {
    const ims_sub = await resolveImsSubFromToken(token);
    if (!ims_sub) {
      return { statusCode: 401, headers: HEADERS, body: { error: 'Could not resolve identity from token' } };
    }

    const supabase = getSupabase(params);
    const { data: row, error } = await supabase
      .from('user_nicknames')
      .select('nickname')
      .eq('ims_sub', ims_sub)
      .maybeSingle();

    if (error) throw error;
    const nickname = row?.nickname || null;
    return { statusCode: 200, headers: HEADERS, body: { nickname } };
  } catch (err) {
    console.error('[get-nickname] error', err);
    return { statusCode: 500, headers: HEADERS, body: { error: err.message } };
  }
}

module.exports = { main };
