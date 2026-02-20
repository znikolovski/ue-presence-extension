/*
 * <license header>
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Flex,
  TextField,
  Button,
  InlineAlert,
  Text,
} from '@adobe/react-spectrum';
import actionWebInvoke, { getActionUrl } from './utils';

const NICKNAME_MAX_LEN = 64;

/**
 * Wraps a settings section with a title for extensibility.
 */
function SettingsSection({ title, children }) {
  return (
    <Flex direction="column" gap="size-150" marginBottom="size-300">
      <Text UNSAFE_style={{ fontWeight: 600, fontSize: 14 }}>{title}</Text>
      {children}
    </Flex>
  );
}

/**
 * Settings view for nickname and future configuration options.
 * @param {object} props
 * @param {object} props.connection - UIX guest connection
 * @param {function(string)} [props.onNicknameSaved] - Called with new nickname after successful save; use to refresh panel
 */
function SettingsView({ connection, onNicknameSaved }) {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'negative', text }
  const [validationError, setValidationError] = useState(null);

  const token = connection?.sharedContext?.get?.('token');

  const loadNickname = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setMessage({ type: 'negative', text: 'Not signed in. Token unavailable.' });
      return;
    }
    try {
      const url = getActionUrl('get-nickname');
      const result = await actionWebInvoke(url, {}, { token }, { method: 'POST' });
      if (result?.error && typeof result.error === 'string') {
        setMessage({ type: 'negative', text: result.error });
      } else {
        setNickname(result?.nickname || '');
      }
    } catch (e) {
      setMessage({ type: 'negative', text: e?.message || 'Failed to load nickname' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadNickname();
  }, [loadNickname]);

  const handleSave = async () => {
    if (!token) {
      setMessage({ type: 'negative', text: 'Not signed in. Token unavailable.' });
      return;
    }

    const trimmed = (nickname || '').trim();
    setValidationError(null);
    setMessage(null);

    if (!trimmed) {
      setValidationError('Nickname is required');
      return;
    }
    if (trimmed.length > NICKNAME_MAX_LEN) {
      setValidationError(`Nickname must be at most ${NICKNAME_MAX_LEN} characters`);
      return;
    }

    setSaving(true);
    try {
      const url = getActionUrl('save-nickname');
      const result = await actionWebInvoke(url, {}, { token, nickname: trimmed }, { method: 'POST' });
      if (result?.error) {
        setMessage({ type: 'negative', text: result.error });
      } else {
        const savedNickname = result?.nickname || trimmed;
        setNickname(savedNickname);
        setMessage({ type: 'success', text: 'Nickname saved. Presence list updated.' });
        onNicknameSaved?.(savedNickname);
      }
    } catch (e) {
      setMessage({ type: 'negative', text: e?.message || 'Failed to save nickname' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Flex alignItems="center" justifyContent="center" minHeight="size-400">
        <Text>Loading...</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="size-200">
      <SettingsSection title="Nickname">
        <Text UNSAFE_style={{ fontSize: 12, color: 'var(--spectrum-global-color-gray-700)' }}>
          Your nickname is shown to others in the presence list and block map.
        </Text>
        <Flex direction="row" gap="size-150" alignItems="end" wrap>
          <TextField
            label="Nickname"
            value={nickname}
            onChange={setNickname}
            maxLength={NICKNAME_MAX_LEN}
            isDisabled={!token}
            errorMessage={validationError}
            validationState={validationError ? 'invalid' : undefined}
            UNSAFE_style={{ minWidth: 180 }}
          />
          <Button variant="accent" onPress={handleSave} isDisabled={saving || !token}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Flex>
      </SettingsSection>

      {message && (
        <InlineAlert variant={message.type === 'success' ? 'positive' : 'negative'}>
          {message.text}
        </InlineAlert>
      )}
    </Flex>
  );
}

export default SettingsView;
