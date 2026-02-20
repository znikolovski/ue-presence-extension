/*
 * <license header>
 */

const { getSupabase, assignColor } = require('../lib/db');
const { resolveUserIdFromToken, resolveImsSubFromToken } = require('../lib/ims-userinfo');

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

async function main(params) {
  const { page_id, user_id: clientUserId, editable_id, token } = params;
  if (!page_id) {
    return { statusCode: 400, headers: HEADERS, body: { error: 'page_id required' } };
  }

  let user_id = clientUserId;
  let identity = null;
  if (token) {
    const ims_sub = await resolveImsSubFromToken(token);
    const displayName = await resolveUserIdFromToken(token);
    if (ims_sub) {
      identity = ims_sub;
      const supabase = getSupabase(params);
      const { data: row } = await supabase
        .from('user_nicknames')
        .select('nickname')
        .eq('ims_sub', ims_sub)
        .maybeSingle();
      if (row?.nickname) user_id = row.nickname;
      else if (displayName) user_id = displayName;
    } else if (displayName) user_id = displayName;
  }
  if (!user_id) user_id = 'anonymous';
  if (!identity) identity = `anon:${user_id}`;

  try {
    const supabase = getSupabase(params);
    const color = assignColor(identity);
    const { error } = await supabase
      .from('presence')
      .upsert(
        {
          page_id,
          identity,
          user_id,
          editable_id: editable_id || null,
          color,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'page_id,identity' }
      );

    if (error) throw error;
    return { statusCode: 200, headers: HEADERS, body: { color, user_id } };
  } catch (err) {
    console.error('[register-presence] error', err);
    return { statusCode: 500, headers: HEADERS, body: { error: err.message } };
  }
}

module.exports = { main };
