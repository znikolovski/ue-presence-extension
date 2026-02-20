/*
 * <license header>
 *
 * Resolves user identity from an Adobe IMS access token via the UserInfo API.
 * Used when sharedContext.imsProfile is not available (e.g. in UE panel iframe).
 */

const IMS_USERINFO_URL = 'https://ims-na1.adobelogin.com/ims/userinfo/v2';

/**
 * Fetches user profile from Adobe IMS UserInfo API.
 * @param {string} accessToken - IMS access token from sharedContext.get('token')
 * @returns {Promise<{sub?: string, given_name?: string, family_name?: string, name?: string, email?: string} | null>} User profile or null on failure
 */
async function fetchUserInfo(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return null;
  try {
    const res = await fetch(IMS_USERINFO_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[ims-userinfo] fetch failed', err?.message);
    return null;
  }
}

/**
 * Makes sub more presentable when it's the only field (e.g. email prefix).
 * @param {string} sub - OIDC sub claim
 * @returns {string} More readable form
 */
function presentableSub(sub) {
  if (!sub || typeof sub !== 'string') return sub;
  // If sub looks like "user@domain", use the part before @
  if (sub.includes('@')) {
    const prefix = sub.split('@')[0];
    if (prefix && prefix.length > 1) return prefix;
  }
  return sub;
}

/**
 * Resolves a display-friendly user_id from an IMS token.
 * Prefers: given_name > first_name > name > email > presentable sub > null
 * Handles nested response and alternate field names (OIDC vs Adobe).
 * @param {string} accessToken - IMS access token
 * @returns {Promise<string|null>} User identifier for presence, or null if resolution fails
 */
async function resolveUserIdFromToken(accessToken) {
  const profile = await fetchUserInfo(accessToken);
  console.info('[ims-userinfo] profile', profile);
  if (!profile) return null;
  const p = profile.user || profile;
  const display =
    p.given_name ||
    p.givenName ||
    p.first_name ||
    p.firstName ||
    p.name ||
    p.displayName ||
    p.email ||
    (p.sub ? presentableSub(p.sub) : null) ||
    null;
  return display;
}

/**
 * Resolves IMS sub (OIDC subject) from an IMS token.
 * Used as stable identity key for user_nicknames and presence lookups.
 * @param {string} accessToken - IMS access token
 * @returns {Promise<string|null>} IMS sub or null if resolution fails
 */
async function resolveImsSubFromToken(accessToken) {
  const profile = await fetchUserInfo(accessToken);
  if (!profile) return null;
  const p = profile.user || profile;
  const sub = p.sub || profile.sub || null;
  return sub && typeof sub === 'string' ? sub : null;
}

module.exports = { fetchUserInfo, resolveUserIdFromToken, resolveImsSubFromToken };
