/*
* <license header>
*/

/* global fetch */

const ACTION_PACKAGE = 'agentic-how-to-presence';

/**
 * Builds the URL for an App Builder web action.
 * - Local dev (localhost): use same-origin URL so the dev server proxies to
 *   Runtime and avoids CORS.
 * - Deployed: use config.json (direct Runtime URL) for whitelisted origins.
 *
 * @param {string} actionName - Action name
 * @returns {string} Full action URL
 */
/**
 * Returns Supabase client config for Realtime (public keys only).
 * Add supabaseUrl and supabaseAnonKey to config.json for the extension.
 *
 * @returns {{ url: string, anonKey: string } | null}
 */
export function getSupabaseConfig() {
  try {
    const config = require('./config.json');
    const url = config.supabaseUrl || config.SUPABASE_URL;
    const anonKey = config.supabaseAnonKey || config.SUPABASE_ANON_KEY;
    if (url && anonKey) return { url, anonKey };
  } catch (e) {
    /* config.json not present */
  }
  return null;
}

export function getActionUrl(actionName) {
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalDev) {
    return `${window.location.origin}/api/v1/web/${ACTION_PACKAGE}/${actionName}`;
  }

  try {
    const config = require('./config.json');
    const url = config[actionName] || config[`${ACTION_PACKAGE}/${actionName}`];
    if (url && typeof url === 'string') {
      if (window.location.protocol === 'https:' && url.startsWith('http://')) {
        return url.replace(/^http:\/\//, 'https://');
      }
      return url;
    }
  } catch (e) {
    /* config.json not present, use fallback */
  }
  return `${window.location.origin}/api/v1/web/default/${ACTION_PACKAGE}/${actionName}`;
}

/**
 *
 * Invokes a web action
 *
 * @param  {string} actionUrl
 * @param {object} headers
 * @param  {object} params
 *
 * @returns {Promise<string|object>} the response
 *
 */

async function actionWebInvoke (actionUrl, headers = {}, params = {}, options = { method: 'POST' }) {  
  const actionHeaders = {
    'Content-Type': 'application/json',
    ...headers
  }

  const fetchConfig = {
    headers: actionHeaders
  }

  if (window.location.hostname === 'localhost') {
    actionHeaders['x-ow-extra-logging'] = 'on'
  }

  fetchConfig.method = options.method.toUpperCase()

  if (fetchConfig.method === 'GET') {
    actionUrl = new URL(actionUrl)
    Object.keys(params).forEach(key => actionUrl.searchParams.append(key, params[key]))
  } else if (fetchConfig.method === 'POST') {
    fetchConfig.body = JSON.stringify(params)
  }
  
  const response = await fetch(actionUrl, fetchConfig)

  let content = await response.text()

  const safeParse = (str, fallback) => {
    if (!str || typeof str !== 'string') return fallback
    try {
      return JSON.parse(str)
    } catch (e) {
      return fallback
    }
  }

  if (!response.ok) {
    const parsed = safeParse(content, { error: content || `Request failed with status ${response.status}` })
    return parsed
  }
  return safeParse(content, content || {})
}

export default actionWebInvoke
