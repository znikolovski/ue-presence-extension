/*
 * <license header>
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Provider,
  defaultTheme,
  Text,
  Flex,
  ProgressCircle,
  InlineAlert
} from '@adobe/react-spectrum';
import MoveTo from '@spectrum-icons/workflow/MoveTo';
import { attach } from '@adobe/uix-guest';
import { extensionId } from './components/Constants';
import actionWebInvoke, { getActionUrl, getSupabaseConfig } from './utils';
import PresenceBlockMap from './PresenceBlockMap';
import SettingsView from './SettingsView';

/**
 * Tries to read user profile from sessionStorage (Adobe IMS profile key).
 * Key pattern: "adobeid_ims_profile/..." - may vary by scopes.
 * Only works when extension shares origin with Experience Cloud (e.g. same-domain iframe).
 */
function extractDisplayId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return (
    obj.first_name ||
    obj.given_name ||
    obj.displayName ||
    obj.name ||
    obj.email ||
    null
  );
}

function getProfileFromSessionStorage() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.indexOf('adobeid_ims_profile') === 0) {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const id =
          extractDisplayId(parsed?.user) ||
          extractDisplayId(parsed?.profile) ||
          extractDisplayId(parsed);
        if (id) return id;
      }
    }
  } catch (_) {
    /* sessionStorage not accessible (e.g. cross-origin iframe) or parse error */
  }
  return null;
}

/**
 * Resolves display-friendly user id from available sources.
 * Tries: sessionStorage (adobeid_ims_profile) > exc-app > sharedContext.
 */
async function resolveDisplayUserId(connection) {
  const fromStorage = getProfileFromSessionStorage();
  if (fromStorage) return fromStorage;

  try {
    const userMod = await import('@adobe/exc-app/user');
    const profile = await userMod.default?.get?.('imsProfile');
    if (profile) {
      const id =
        profile.first_name ||
        profile.given_name ||
        profile.displayName ||
        profile.name ||
        profile.email;
      if (id) return id;
    }
  } catch (_) {
    /* exc-app not available (e.g. panel iframe, local dev) */
  }
  const imsProfile = connection?.sharedContext?.get?.('imsProfile');
  if (imsProfile) {
    return (
      imsProfile.first_name ||
      imsProfile.given_name ||
      imsProfile.displayName ||
      imsProfile.name ||
      imsProfile.email ||
      imsProfile.userId ||
      imsProfile.sub ||
      null
    );
  }
  return null;
}

const HEARTBEAT_INTERVAL_MS = 8000;
const PRESENCE_POLL_INTERVAL_MS = 3000; // Fallback when Supabase Realtime unavailable
const LIVE_INDICATOR_GRACE_MS = 5000;

function PresencePanel() {
  const [connection, setConnection] = useState(null);
  const [theme, setTheme] = useState({ colorScheme: 'light' });
  const [pageId, setPageId] = useState('');
  const [userId, setUserId] = useState('');
  const [myColor, setMyColor] = useState('');
  const [presence, setPresence] = useState([]);
  const [editables, setEditables] = useState([]);
  const [selectedEditableIds, setSelectedEditableIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map' | 'settings'
  const [showLiveIndicator, setShowLiveIndicator] = useState(false);
  const [lastPresenceUpdate, setLastPresenceUpdate] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const heartbeatRef = useRef(null);
  const presencePollRef = useRef(null);
  const sessionUserIdRef = useRef(null);
  const presenceMountedRef = useRef(true);

  useEffect(() => {
    let mounted = true;
    attach({ id: extensionId })
      .then((conn) => {
        if (!mounted) return;
        setConnection(conn);
        const themeCtx = conn.sharedContext?.get?.('theme');
        if (themeCtx) setTheme((t) => ({ ...t, colorScheme: themeCtx?.colorScheme || t.colorScheme }));
        conn.sharedContext?.subscribe?.('theme', (ctx) => {
          if (ctx?.colorScheme) setTheme((t) => ({ ...t, colorScheme: ctx.colorScheme }));
        });
        return conn.host?.editorState?.get?.();
      })
      .then((state) => {
        if (!mounted) return;
        const loc = state?.location || window.location?.href || 'unknown';
        setPageId(loc);
      })
      .catch((err) => {
        if (mounted) setError(err?.message || 'Failed to connect to host');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const registerPresence = useCallback(async (pid, token, fallbackUserId, editableId) => {
    if (!pid) return null;
    try {
      const url = getActionUrl('register-presence');
      const params = { page_id: pid, editable_id: editableId };
      if (token) params.token = token;
      if (fallbackUserId) params.user_id = fallbackUserId;
      const result = await actionWebInvoke(url, {}, params, { method: 'POST' });
      if (result?.color) setMyColor(result.color);
      return result?.user_id || fallbackUserId || 'anonymous';
    } catch (e) {
      console.warn('[PresencePanel] register-presence failed', e);
      return fallbackUserId || 'anonymous';
    }
  }, []);

  const sendHeartbeat = useCallback(async (pid, uid, editableId, token) => {
    if (!pid || !uid) return;
    try {
      const url = getActionUrl('heartbeat');
      const params = { page_id: pid, user_id: uid, editable_id: editableId };
      if (token) params.token = token;
      await actionWebInvoke(url, {}, params, { method: 'POST' });
    } catch (e) {
      console.warn('[PresencePanel] heartbeat failed', e);
    }
  }, []);

  const applyPresenceUpdate = useCallback((items) => {
    setPresence((prev) => {
      const prevMap = new Map(prev.map((p) => [`${p.user_id}`, p]));
      const changed = new Set();
      for (const p of items) {
        const old = prevMap.get(p.user_id);
        if (!old || old.editable_id !== (p.editable_id || null)) {
          changed.add(p.user_id);
        }
      }
      if (changed.size > 0) {
        setHighlightedIds(new Set(changed));
        setTimeout(() => setHighlightedIds(new Set()), 1200);
      }
      return items;
    });
    setShowLiveIndicator(true);
    setLastPresenceUpdate(Date.now());
  }, []);

  useEffect(() => {
    if (!lastPresenceUpdate) return;
    const t = setTimeout(() => setShowLiveIndicator(false), LIVE_INDICATOR_GRACE_MS);
    return () => clearTimeout(t);
  }, [lastPresenceUpdate]);

  const fetchPresence = useCallback(async (pid) => {
    if (!pid) return;
    try {
      const url = getActionUrl('get-presence');
      const result = await actionWebInvoke(url, {}, { page_id: pid }, { method: 'POST' });
      if (result?.items) applyPresenceUpdate(result.items);
    } catch (e) {
      console.warn('[PresencePanel] get-presence failed', e);
    }
  }, [applyPresenceUpdate]);

  const leavePresence = useCallback(async (pid, uid, token) => {
    if (!pid || !uid) return;
    try {
      const url = getActionUrl('leave-presence');
      const params = { page_id: pid, user_id: uid };
      if (token) params.token = token;
      await actionWebInvoke(url, {}, params, { method: 'POST' });
    } catch (e) {
      console.warn('[PresencePanel] leave-presence failed', e);
    }
  }, []);

  const fetchEditables = useCallback(async () => {
    if (!connection?.host?.editorState) return;
    try {
      const state = await connection.host.editorState.get();
      setEditables(state?.editables || []);
      const sel = state?.selected || {};
      setSelectedEditableIds(new Set(Object.keys(sel).filter((id) => sel[id])));
    } catch (e) {
      console.warn('[PresencePanel] fetchEditables failed', e);
    }
  }, [connection]);

  const scrollToEditable = useCallback(async (editableId) => {
    if (!connection?.host?.editorActions?.selectEditables || !editableId) return;
    setSelectedEditableIds(new Set([editableId]));
    try {
      const state = await connection.host.editorState.get();
      const editables = state?.editables || [];
      const editable = editables.find((e) => e.id === editableId);
      if (editable) {
        connection.host.editorActions.selectEditables([editable]);
      } else {
        console.warn('[PresencePanel] editable not found:', editableId);
      }
    } catch (e) {
      console.warn('[PresencePanel] scrollToEditable failed', e);
    }
  }, [connection]);

  useEffect(() => {
    if (!pageId || !connection) return;

    const token = connection.sharedContext?.get?.('token');

    const getEditableId = async () => {
      try {
        const state = await connection.host?.editorState?.get?.();
        const selected = state?.selected || {};
        const ids = Object.keys(selected).filter((id) => selected[id]);
        return ids[0] || null;
      } catch (e) {
        return null;
      }
    };

    let resolvedUserId = null;

    (async () => {
      const fallbackUserId = await resolveDisplayUserId(connection);
      const editableId = await getEditableId();
      resolvedUserId = await registerPresence(pageId, token, fallbackUserId, editableId);
      if (resolvedUserId) {
        sessionUserIdRef.current = resolvedUserId;
        setUserId(resolvedUserId);
      }
    })();

    const runHeartbeat = async () => {
      const uid = sessionUserIdRef.current || resolvedUserId;
      if (!uid) return;
      const editableId = await getEditableId();
      sendHeartbeat(pageId, uid, editableId, token);
    };

    heartbeatRef.current = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Real-time presence: Supabase Realtime subscription, fallback to polling
    presenceMountedRef.current = true;
    let realtimeConnected = false;

    const supabaseConfig = getSupabaseConfig();
    if (supabaseConfig?.url && supabaseConfig?.anonKey) {
      import('@supabase/supabase-js').then(({ createClient }) => {
        if (!presenceMountedRef.current) return;
        const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
        const channelName = `presence-${pageId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
        const filterSafe = !/[:\/?&=]/.test(pageId);
        const subConfig = {
          event: '*',
          schema: 'public',
          table: 'presence',
        };
        if (filterSafe) subConfig.filter = `page_id=eq.${pageId}`;

        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            subConfig,
            (payload) => {
              const affected = payload?.new?.page_id === pageId || payload?.old?.page_id === pageId;
              if (filterSafe || affected) {
                if (presenceMountedRef.current) fetchPresence(pageId);
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') realtimeConnected = true;
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              if (!presencePollRef.current && presenceMountedRef.current) {
                presencePollRef.current = setInterval(() => fetchPresence(pageId), PRESENCE_POLL_INTERVAL_MS);
              }
            }
          });

        const unsub = () => {
          supabase.removeChannel(channel);
        };
        window.__presenceRealtimeUnsub = unsub;
      }).catch((e) => {
        console.warn('[PresencePanel] Supabase Realtime init failed', e);
        if (!presencePollRef.current && presenceMountedRef.current) {
          presencePollRef.current = setInterval(() => fetchPresence(pageId), PRESENCE_POLL_INTERVAL_MS);
        }
      });
    } else {
      presencePollRef.current = setInterval(() => fetchPresence(pageId), PRESENCE_POLL_INTERVAL_MS);
    }

    fetchPresence(pageId);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPresence(pageId);
        fetchEditables();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    fetchEditables();

    const onUnload = () => {
      const uid = sessionUserIdRef.current || resolvedUserId;
      if (uid) leavePresence(pageId, uid, token);
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      presenceMountedRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (presencePollRef.current) clearInterval(presencePollRef.current);
      if (typeof window.__presenceRealtimeUnsub === 'function') {
        window.__presenceRealtimeUnsub();
        window.__presenceRealtimeUnsub = undefined;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onUnload);
      const uid = sessionUserIdRef.current || resolvedUserId;
      if (uid) leavePresence(pageId, uid, token);
    };
  }, [pageId, connection, registerPresence, sendHeartbeat, fetchPresence, leavePresence, fetchEditables]);

  if (loading) {
    return (
      <Provider theme={defaultTheme} colorScheme={theme.colorScheme}>
        <Flex alignItems="center" justifyContent="center" minHeight="size-400">
          <ProgressCircle size="S" aria-label="Loading…" isIndeterminate />
        </Flex>
      </Provider>
    );
  }

  if (error) {
    return (
      <Provider theme={defaultTheme} colorScheme={theme.colorScheme}>
        <Flex direction="column" padding="size-200">
          <InlineAlert variant="negative">{error}</InlineAlert>
        </Flex>
      </Provider>
    );
  }

  return (
    <Provider theme={defaultTheme} colorScheme={theme.colorScheme}>
      <div className="PresencePanel" style={{ padding: '16px 16px 8px', width: '100%', boxSizing: 'border-box' }}>
        <header className="PresencePanel-header">
          <h2 className="PresencePanel-title">Who&apos;s on this page</h2>
          <span className="PresencePanel-headerBadges">
            {showLiveIndicator && (
              <span className="PresencePanel-liveBadge" title="Presence data recently updated">
                <span className="PresencePanel-liveDot" />
                Live
              </span>
            )}
            {myColor && (
              <span className="PresencePanel-youBadge">
                <span
                  className="PresencePanel-itemDot"
                  style={{ backgroundColor: myColor }}
                  title="You"
                />
                You
              </span>
            )}
          </span>
        </header>
        <div className="PresencePanel-tabs">
          <button
            type="button"
            className={`PresencePanel-tab ${viewMode === 'list' ? 'is-selected' : ''}`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
          <button
            type="button"
            className={`PresencePanel-tab ${viewMode === 'map' ? 'is-selected' : ''}`}
            onClick={() => {
              setViewMode('map');
              fetchEditables();
            }}
          >
            Map
          </button>
          <button
            type="button"
            className={`PresencePanel-tab ${viewMode === 'settings' ? 'is-selected' : ''}`}
            onClick={() => setViewMode('settings')}
          >
            Settings
          </button>
        </div>
        <div className="PresencePanel-content">
          {viewMode === 'settings' ? (
            <SettingsView
              connection={connection}
              onNicknameSaved={(newNickname) => {
                setUserId(newNickname);
                sessionUserIdRef.current = newNickname;
                if (pageId) fetchPresence(pageId);
              }}
            />
          ) : viewMode === 'map' ? (
            <PresenceBlockMap
              editables={editables}
              presence={presence}
              selectedEditableIds={selectedEditableIds}
              highlightedIds={highlightedIds}
              onSelectEditable={scrollToEditable}
            />
          ) : presence.length === 0 ? (
            <p className="PresencePanel-empty">No other viewers on this page.</p>
          ) : (
            <div role="list" aria-label="Presence list">
              {presence.map((item) => (
                <div
                  key={`${item.user_id}-${item.last_seen}`}
                  className={`PresencePanel-item ${highlightedIds.has(item.user_id) ? 'PresencePanel-item--highlighted' : ''}`}
                  role="listitem"
                >
                  <span
                    className="PresencePanel-itemDot"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  <span className="PresencePanel-itemName">{item.user_id}</span>
                  {item.editable_id ? (
                    <>
                      <span className="PresencePanel-itemMeta">
                        editing {item.editable_id.substring(0, 8)}…
                      </span>
                      <button
                        type="button"
                        className="PresencePanel-gotoBtn"
                        aria-label={`Jump to block ${item.editable_id.substring(0, 8)}`}
                        onClick={() => scrollToEditable(item.editable_id)}
                      >
                        <MoveTo size="S" aria-hidden />
                        <span style={{ marginLeft: 4 }}>Go</span>
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Provider>
  );
}

export default PresencePanel;
