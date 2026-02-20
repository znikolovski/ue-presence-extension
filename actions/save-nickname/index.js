/*
 * <license header>
 */

const { getSupabase } = require('../lib/db');
const { resolveImsSubFromToken } = require('../lib/ims-userinfo');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

const NICKNAME_MAX_LEN = 64;

async function main(params) {
  const { token, nickname: rawNickname } = params;
  if (!token) {
    return { statusCode: 401, headers: HEADERS, body: { error: 'token required' } };
  }

  const nickname = typeof rawNickname === 'string' ? rawNickname.trim() : '';
  if (!nickname || nickname.length < 1) {
    return { statusCode: 400, headers: HEADERS, body: { error: 'nickname required (1-64 chars)' } };
  }
  if (nickname.length > NICKNAME_MAX_LEN) {
    return { statusCode: 400, headers: HEADERS, body: { error: `nickname must be at most ${NICKNAME_MAX_LEN} chars` } };
  }

  try {
    const ims_sub = await resolveImsSubFromToken(token);
    if (!ims_sub) {
      return { statusCode: 401, headers: HEADERS, body: { error: 'Could not resolve identity from token' } };
    }

    const supabase = getSupabase(params);
    const { error: nickError } = await supabase
      .from('user_nicknames')
      .upsert(
        { ims_sub, nickname, updated_at: new Date().toISOString() },
        { onConflict: 'ims_sub' }
      );

    if (nickError) throw nickError;

    // Update presence table so display refreshes immediately across all pages
    const { error: presenceError } = await supabase
      .from('presence')
      .update({ user_id: nickname, last_seen: new Date().toISOString() })
      .eq('identity', ims_sub);

    if (presenceError) {
      console.warn('[save-nickname] presence update failed (identity column may not exist yet)', presenceError.message);
    }

    return { statusCode: 200, headers: HEADERS, body: { nickname } };
  } catch (err) {
    console.error('[save-nickname] error', err);
    return { statusCode: 500, headers: HEADERS, body: { error: err.message } };
  }
}

module.exports = { main };
